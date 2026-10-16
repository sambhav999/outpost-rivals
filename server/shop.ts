import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  id,
  randomBytes,
  hexlify,
  Interface,
  getAddress,
  formatUnits,
} from "ethers";
import { rivalAmount } from "./pricing";
import { SHOP_ITEMS } from "../shared/economy";
import { ORDER_TYPES, PRICE_CHECK_TYPES, STORE_ABI, ERC20_ABI } from "../shared/checkout";
import { liquidity, assertTradablePool } from "./liquidity";
import type { Config } from "./config";
import type { DB } from "./db";
import { tx } from "./db";
export function shop(db: DB, c: Config, injectedProvider?: JsonRpcProvider) {
  const provider =
    injectedProvider ||
    new JsonRpcProvider(c.rpc, c.chainId, { staticNetwork: true });
  const pool = liquidity(db, c);
  let enabled = false,
    reason = "Shop is not configured. No payment is possible.";
  async function check() {
    enabled = false;
    try {
      if (!c.signer || !c.store || !c.token || !c.stable)
        throw Error("Shop deployment and quote signer are not configured");
      const network = Number(BigInt(await provider.send("eth_chainId", [])));
      if (network !== c.chainId) throw Error("Wrong RPC chain");
      const s = new Contract(c.store, STORE_ABI, provider);
      if (
        (await s.token()).toLowerCase() !== c.token.toLowerCase() ||
        (await s.stable()).toLowerCase() !== c.stable.toLowerCase()
      )
        throw Error("Asset mismatch");
      if (
        (await s.quoteSigner()).toLowerCase() !==
        new Wallet(c.signer).address.toLowerCase()
      )
        throw Error("Quote signer mismatch");
      if (await s.paused()) throw Error("Shop paused");
      await s.purchasedSku(ZeroAddress, id("version-check"));
      if (Number(await s.priceGuardVersion()) !== 1) throw Error("Price guard contract version mismatch");
      for (const [a, d] of [
        [c.token, c.tokenDecimals],
        [c.stable, c.stableDecimals],
      ] as const) {
        if (Number(await new Contract(a, ERC20_ABI, provider).decimals()) !== d)
          throw Error("Asset decimals mismatch");
      }
      enabled = true;
      reason = "Deployment checked against RPC";
    } catch (e: any) {
      reason = e.message;
    }
    return { enabled, reason };
  }
  async function requireLiquidMarket(priceUsd6: string) {
    if (c.chainId === 46630) return;
    const p = await pool.get(true);
    assertTradablePool(p, c, priceUsd6);
  }
  async function quote(user: any, sku: string, asset: string) {
    const account = db.prepare("SELECT wallet,onboarded FROM users WHERE id=?").get(user.id) as any;
    if (!account?.wallet) throw Error("Connect and verify your wallet first");
    if (!account.onboarded) throw Error("Create your captain before checkout");
    await check();
    if (!enabled) throw Error(reason);
    const item = SHOP_ITEMS.find((i) => i.id === sku);
    if (!item) throw Error("Unknown cosmetic");
    if (
      db
        .prepare("SELECT 1 FROM inventory WHERE user_id=? AND sku=?")
        .get(user.id, sku)
    )
      throw Error("Already owned");
    if (await new Contract(c.store, STORE_ABI, provider).purchasedSku(account.wallet, id(sku)))
      throw Error("Already purchased onchain. Contact support if your inventory is missing.");
    if (!["stable", "rival"].includes(asset))
      throw Error("Unsupported payment asset");
    if (item.payment === "rival" && asset !== "rival")
      throw Error("This visual edition is priced in RIVAL only");
    if (item.minMatches && (db.prepare("SELECT played FROM users WHERE id=?").get(user.id) as any).played < item.minMatches)
      throw Error(`Play ${item.minMatches} tactical matches before this edition unlocks`);
    const tokenQuote = asset === "rival" ? await rivalAmount(c, item.priceCents) : null;
    if (tokenQuote) await requireLiquidMarket(tokenQuote.priceUsd6);
    const amount = tokenQuote?.amount ?? (BigInt(item.priceCents) * 10n ** BigInt(c.stableDecimals)) / 100n;
    if (amount <= 0n) throw Error("Invalid configured price");
    const order = {
      orderId: hexlify(randomBytes(32)),
      payer: getAddress(account.wallet),
      asset: asset === "stable" ? c.stable : c.token,
      amount: amount.toString(),
      priceUsd6: tokenQuote?.priceUsd6 ?? "0",
      sku: id(sku),
      creator: ZeroAddress,
      expires: Math.floor(Date.now() / 1000) + (asset === "rival" && c.chainId === 4663 ? 60 : 300),
    };
    const domain = {
      name: "OutpostStore",
      version: "2",
      chainId: c.chainId,
      verifyingContract: c.store,
    };
    const signature = await new Wallet(c.signer).signTypedData(
      domain,
      ORDER_TYPES,
      order,
    );
    const payload = {
      order,
      sku,
      asset,
      quoteSource: tokenQuote?.source || "USDG denomination",
      domain,
      store: c.store,
      displayAmount:
        asset === "stable" ? `${formatUnits(amount, c.stableDecimals)} USDG` : tokenQuote!.display,
    };
    db.prepare(
      "INSERT INTO orders(id,user_id,payload,signature) VALUES (?,?,?,?)",
    ).run(order.orderId, user.id, JSON.stringify(payload), signature);
    return { ...payload, signature };
  }
  async function priceCheck(user: any, orderId: string) {
    const row: any = db.prepare("SELECT payload,status FROM orders WHERE id=? AND user_id=?")
      .get(orderId, user.id);
    if (!row || row.status !== "pending") throw Error("Pending order not found");
    const p = JSON.parse(row.payload);
    if (p.asset !== "rival") throw Error("USDG purchases do not need a token price check");
    const now = Math.floor(Date.now() / 1000);
    if (p.order.expires <= now + 5) throw Error("Order expired; request a new quote");
    await check();
    if (!enabled) throw Error(reason);
    const item = SHOP_ITEMS.find(i => i.id === p.sku);
    if (!item) throw Error("Unknown cosmetic");
    const current = await rivalAmount(c, item.priceCents);
    await requireLiquidMarket(current.priceUsd6);
    const quoted = BigInt(p.order.priceUsd6), price = BigInt(current.priceUsd6);
    if (price * 10000n < quoted * 9700n || price * 10000n > quoted * 10300n)
      throw Error("RIVAL price moved more than 3%; request a new quote");
    const proof = { orderId, priceUsd6: current.priceUsd6,
      observedAt: current.observedAt, expires: Math.min(p.order.expires, current.observedAt + 20) };
    if (proof.expires <= now + 5) throw Error("Price observation too old; retry");
    const signature = await new Wallet(c.signer).signTypedData(p.domain, PRICE_CHECK_TYPES, proof);
    return { proof, signature, source: current.source };
  }
  async function confirm(user: any, orderId: string, hash: string) {
    const row: any = db
      .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
      .get(orderId, user.id);
    if (!row) throw Error("Order not found");
    if (row.status === "confirmed") return { confirmed: true };
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
      throw Error("Invalid transaction hash");
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt || receipt.status !== 1)
      throw Error("Successful transaction not found");
    if ((await receipt.confirmations()) < c.confirmations)
      throw Error(
        "Waiting for chain confirmations. Retry confirmation shortly.",
      );
    const block = await provider.getBlock(receipt.blockNumber);
    if (block?.hash !== receipt.blockHash)
      throw Error("Receipt is not canonical");
    const p = JSON.parse(row.payload),
      iface = new Interface(STORE_ABI);
    const event = receipt.logs
      .filter((l) => l.address.toLowerCase() === c.store.toLowerCase())
      .map((l) => {
        try {
          return iface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l) => l?.name === "Purchased" && l.args.orderId === orderId);
    if (
      !event ||
      event.args.payer.toLowerCase() !== p.order.payer.toLowerCase() ||
      event.args.asset.toLowerCase() !== p.order.asset.toLowerCase() ||
      event.args.amount.toString() !== p.order.amount ||
      event.args.sku !== p.order.sku
    )
      throw Error("Receipt does not match the signed order");
    tx(db, () => {
      const updated = db.prepare("UPDATE orders SET status=?,tx=? WHERE id=? AND user_id=? AND status='pending'").run(
        "confirmed", hash, orderId, user.id,
      );
      if (!updated.changes) return; // Concurrent receipt confirmation already won.
      db.prepare("INSERT OR IGNORE INTO inventory VALUES (?,?,?)").run(
        user.id,
        p.sku,
        orderId,
      );
      const row = db.prepare("SELECT * FROM economy_totals WHERE id=1").get() as any;
      const amount = BigInt(p.order.amount);
      db.prepare("UPDATE economy_totals SET rival_orders=?,stable_orders=?,rival_gross=?,rival_retired=?,stable_gross=? WHERE id=1").run(
        row.rival_orders + (p.asset === "rival" ? 1 : 0),
        row.stable_orders + (p.asset === "stable" ? 1 : 0),
        (BigInt(row.rival_gross) + (p.asset === "rival" ? amount : 0n)).toString(),
        (BigInt(row.rival_retired) + (p.asset === "rival" ? amount * BigInt(p.order.creator.toLowerCase() === ZeroAddress.toLowerCase() ? 2000 : 200) / 10000n : 0n)).toString(),
        (BigInt(row.stable_gross) + (p.asset === "stable" ? amount : 0n)).toString(),
      );
    });
    return { confirmed: true };
  }
  function metrics() {
    const row = db.prepare("SELECT * FROM economy_totals WHERE id=1").get() as any;
    return {
      rivalOrders: row.rival_orders, stableOrders: row.stable_orders,
      rivalGross: formatUnits(BigInt(row.rival_gross), c.tokenDecimals),
      rivalRetired: formatUnits(BigInt(row.rival_retired), c.tokenDecimals),
      stableGross: formatUnits(BigInt(row.stable_gross), c.stableDecimals),
      scope: "confirmed in this server database; reconcile with chain receipts for full history",
    };
  }
  return {
    check,
    quote,
    priceCheck,
    confirm,
    liquidity: () => pool.get(),
    metrics,
    status: () => ({
      enabled, reason,
      rivalEnabled: enabled && (c.chainId === 46630 ? !!c.tokenUnitsPerDollar : !!(c.rivalPriceUrl && c.rivalMinPriceUsd && c.rivalMaxPriceUsd && c.o1ReadApiKey)),
    }),
    close: () => provider.destroy(),
  };
}
