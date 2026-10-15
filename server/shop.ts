import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  id,
  randomBytes,
  hexlify,
  parseUnits,
  Interface,
  getAddress,
} from "ethers";
import { SHOP_ITEMS } from "../shared/economy";
import { ORDER_TYPES, STORE_ABI, ERC20_ABI } from "../shared/checkout";
import type { Config } from "./config";
import type { DB } from "./db";
import { tx } from "./db";
export function shop(db: DB, c: Config, injectedProvider?: JsonRpcProvider) {
  const provider =
    injectedProvider ||
    new JsonRpcProvider(c.rpc, c.chainId, { staticNetwork: true });
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
  async function quote(user: any, sku: string, asset: string) {
    await check();
    if (!enabled) throw Error(reason);
    if (!user.wallet) throw Error("Connect and verify your wallet first");
    const item = SHOP_ITEMS.find((i) => i.id === sku);
    if (!item) throw Error("Unknown cosmetic");
    if (
      db
        .prepare("SELECT 1 FROM inventory WHERE user_id=? AND sku=?")
        .get(user.id, sku)
    )
      throw Error("Already owned");
    if (!["stable", "rival"].includes(asset))
      throw Error("Unsupported payment asset");
    if (asset === "rival" && !c.tokenUnitsPerDollar)
      throw Error("Token pricing has not been configured");
    const amount =
      asset === "stable"
        ? (BigInt(item.priceCents) * 10n ** BigInt(c.stableDecimals)) / 100n
        : (parseUnits(c.tokenUnitsPerDollar, c.tokenDecimals) *
            BigInt(item.priceCents)) /
          100n;
    if (amount <= 0n) throw Error("Invalid configured price");
    const order = {
      orderId: hexlify(randomBytes(32)),
      payer: getAddress(user.wallet),
      asset: asset === "stable" ? c.stable : c.token,
      amount: amount.toString(),
      sku: id(sku),
      creator: ZeroAddress,
      expires: Math.floor(Date.now() / 1000) + 300,
    };
    const domain = {
      name: "OutpostStore",
      version: "1",
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
      domain,
      store: c.store,
      displayAmount:
        asset === "stable"
          ? `${item.priceCents / 100} USDG`
          : `${(Number(c.tokenUnitsPerDollar) * item.priceCents) / 100} RIVAL`,
    };
    db.prepare(
      "INSERT INTO orders(id,user_id,payload,signature) VALUES (?,?,?,?)",
    ).run(order.orderId, user.id, JSON.stringify(payload), signature);
    return { ...payload, signature };
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
      db.prepare("UPDATE orders SET status=?,tx=? WHERE id=?").run(
        "confirmed",
        hash,
        orderId,
      );
      db.prepare("INSERT OR IGNORE INTO inventory VALUES (?,?,?)").run(
        user.id,
        p.sku,
        orderId,
      );
    });
    return { confirmed: true };
  }
  return {
    check,
    quote,
    confirm,
    status: () => ({ enabled, reason }),
    close: () => provider.destroy(),
  };
}
