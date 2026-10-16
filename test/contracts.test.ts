import { shop } from "../server/shop";
import { database } from "../server/db";
import { config } from "../server/config";
import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  BrowserProvider,
  Wallet,
  ContractFactory,
  Contract,
  ZeroAddress,
  id,
  parseEther,
} from "ethers";
import { compile } from "../scripts/compile";
import { ORDER_TYPES, PRICE_CHECK_TYPES, EMPTY_PRICE_CHECK } from "../shared/checkout";
test("contract checkout: splits, exact allowance, replay, signer, expiry, asset, pause and payer boundaries", async () => {
  const node = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 46630, hardfork: "shanghai" },
    wallet: { totalAccounts: 5 },
  });
  const provider = new BrowserProvider(node as any),
    owner = await provider.getSigner(0),
    buyer = await provider.getSigner(1),
    treasury = await provider.getSigner(2),
    creator = await provider.getSigner(3),
    quoteSigner = Wallet.createRandom(),
    art = compile();
  async function deploy(name: string, args: any[]) {
    const c = await new ContractFactory(
      art[name].abi,
      art[name].bytecode,
      owner,
    ).deploy(...args);
    await c.waitForDeployment();
    return new Contract(await c.getAddress(), art[name].abi, owner);
  }
  try {
    const token = await deploy("MockToken", ["Test Rival", "tRIVAL", 18]),
      stable = await deploy("MockToken", ["Test Dollar", "tUSDG", 6]),
      store = await deploy("OutpostStore", [
        await token.getAddress(),
        await stable.getAddress(),
        await treasury.getAddress(),
        quoteSigner.address,
        await owner.getAddress(),
      ]);
    const address = await store.getAddress(),
      payer = await buyer.getAddress(),
      domain = {
        name: "OutpostStore",
        version: "2",
        chainId: 46630,
        verifyingContract: address,
      };
    await (await token.transfer(payer, parseEther("1000"))).wait();
    await (await stable.transfer(payer, 1000000000n)).wait();
    await (
      await (token.connect(buyer) as Contract).approve(
        address,
        parseEther("1000"),
      )
    ).wait();
    await (
      await (stable.connect(buyer) as Contract).approve(address, 1000000000n)
    ).wait();
    let count = 0;
    const make = (overrides: any = {}) => ({
      orderId: id("order" + count++),
      payer,
      asset: token.target,
      amount: parseEther("100"),
      priceUsd6: "1000000",
      sku: id("sku" + count),
      creator: ZeroAddress,
      expires: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    });
    const sign = (o: any, w = quoteSigner) =>
      w.signTypedData(domain, ORDER_TYPES, o);
    const priceProof = (o: any, overrides: any = {}) => ({
      orderId: o.orderId, priceUsd6: o.priceUsd6,
      observedAt: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 18,
      ...overrides,
    });
    const withProof = async (o: any, signer = quoteSigner, proof = priceProof(o), proofSigner = quoteSigner): Promise<any[]> =>
      [o, await sign(o, signer), o.asset === token.target ? proof : EMPTY_PRICE_CHECK,
        o.asset === token.target ? await proofSigner.signTypedData(domain, PRICE_CHECK_TYPES, proof) : "0x"];
    const buy = store.connect(buyer) as Contract;
    const o = make(),
      sig = await sign(o), proof = priceProof(o), proofSig = await quoteSigner.signTypedData(domain, PRICE_CHECK_TYPES, proof);
    await (await buy.purchase(o, sig, proof, proofSig)).wait();
    assert.equal(await store.purchasedSku(payer,o.sku),true);
    assert.equal(
      await token.balanceOf("0x000000000000000000000000000000000000dEaD"),
      parseEther("20"),
    );
    assert.equal(
      await token.balanceOf(await treasury.getAddress()),
      parseEther("80"),
    );
    assert.equal(await token.balanceOf(address), 0n);
    await assert.rejects(() => buy.purchase.staticCall(o, sig, proof, proofSig));
    const duplicateSku = make({ sku: o.sku, asset: stable.target, amount: 4000000n, priceUsd6: "0" });
    const duplicateSignature = await sign(duplicateSku);
    const beforeDuplicate = await stable.balanceOf(payer);
    await assert.rejects(() => buy.purchase.staticCall(duplicateSku, duplicateSignature, EMPTY_PRICE_CHECK, "0x"), /already purchased/);
    assert.equal(await stable.balanceOf(payer), beforeDuplicate);
    const wrong = make();
    await assert.rejects(async () =>
      buy.purchase.staticCall(...await withProof(wrong, Wallet.createRandom())),
    );
    const expired = make({ expires: 1 });
    await assert.rejects(async () =>
      buy.purchase.staticCall(...await withProof(expired)),
    );
    const badAsset = make({ asset: await creator.getAddress() });
    await assert.rejects(async () =>
      buy.purchase.staticCall(...await withProof(badAsset)),
    );
    const fresh = make();
    await assert.rejects(async () =>
      store.purchase.staticCall(...await withProof(fresh)),
    );
    await assert.rejects(async () =>
      buy.purchase.staticCall(
        fresh,
        await quoteSigner.signTypedData(
          { ...domain, chainId: 4663 },
          ORDER_TYPES,
          fresh,
        ),
        priceProof(fresh),
        await quoteSigner.signTypedData(domain, PRICE_CHECK_TYPES, priceProof(fresh)),
      ),
    );
    const moved = make();
    await assert.rejects(async () => buy.purchase.staticCall(...await withProof(moved, quoteSigner, priceProof(moved, { priceUsd6: "4000000" }))), /price moved/);
    const staleProof = make();
    await assert.rejects(async () => buy.purchase.staticCall(...await withProof(staleProof, quoteSigner,
      priceProof(staleProof, { observedAt: Math.floor(Date.now()/1000)-60, expires: Math.floor(Date.now()/1000)-40 }))), /price expired/);
    const forged = make();
    await assert.rejects(async () => buy.purchase.staticCall(...await withProof(forged, quoteSigner, priceProof(forged), Wallet.createRandom())), /price signature/);
    const noProof = make();
    await assert.rejects(async () => buy.purchase.staticCall(noProof, await sign(noProof), EMPTY_PRICE_CHECK, "0x"), /price/);
    const co = make({ creator: await creator.getAddress() });
    await (await buy.purchase(...await withProof(co))).wait();
    assert.equal(
      await token.balanceOf(await creator.getAddress()),
      parseEther("90"),
    );
    assert.equal(
      await token.balanceOf(await treasury.getAddress()),
      parseEther("88"),
    );
    const so = make({ asset: stable.target, amount: 4000000n, priceUsd6: "0" });
    await (await buy.purchase(...await withProof(so))).wait();
    assert.equal(await stable.balanceOf(await treasury.getAddress()), 4000000n);
    const db = database(":memory:");
    db.prepare("INSERT INTO users(id,name,wallet,onboarded) VALUES (?,?,?,1)").run(
      "buyer",
      "Buyer",
      payer.toLowerCase(),
    );
    const checkoutConfig = {
        ...config,
        chainId: 46630,
        store: address,
        token: await token.getAddress(),
        stable: await stable.getAddress(),
        signer: quoteSigner.privateKey,
        confirmations: 1,
        tokenUnitsPerDollar: "10",
      };
    const checkout = shop(db, checkoutConfig, provider as any);
    assert.equal((await checkout.check()).enabled, true);
    await assert.rejects(() => checkout.quote({ id: "buyer" }, "season-one-aurora", "stable"));
    await assert.rejects(() => checkout.quote({ id: "buyer" }, "season-one-captain", "rival"));
    const edition = await checkout.quote({ id: "buyer" }, "season-one-aurora", "rival");
    assert.equal(edition.quoteSource, "testnet merchant tariff");
    const editionProof = await checkout.priceCheck({ id: "buyer" }, edition.order.orderId);
    const editionTx = await buy.purchase(edition.order, edition.signature, editionProof.proof, editionProof.signature);
    await editionTx.wait();
    await checkout.confirm({ id: "buyer" }, edition.order.orderId, editionTx.hash);
    assert.equal(checkout.metrics().rivalOrders, 1);
    assert.equal(checkout.metrics().rivalRetired, "16.0");
    db.prepare("UPDATE users SET played=3 WHERE id='buyer'").run();
    const movedQuote = await checkout.quote({ id: "buyer" }, "season-one-captain", "rival");
    assert.equal(movedQuote.sku, "season-one-captain");
    checkoutConfig.tokenUnitsPerDollar = "11";
    await assert.rejects(() => checkout.priceCheck({ id: "buyer" }, movedQuote.order.orderId), /price moved/);
    checkoutConfig.tokenUnitsPerDollar = "10";
    const order = await checkout.quote(
      { id: "buyer", wallet: payer },
      "moss-crown",
      "stable",
    );
    const paid = await buy.purchase(order.order, order.signature, EMPTY_PRICE_CHECK, "0x");
    await paid.wait();
    const confirmations = await Promise.all([
      checkout.confirm({ id: "buyer" }, order.order.orderId, paid.hash),
      checkout.confirm({ id: "buyer" }, order.order.orderId, paid.hash),
    ]);
    assert.ok(confirmations.every((c) => c.confirmed));
    assert.equal(checkout.metrics().stableOrders, 1);
    assert.equal(checkout.metrics().stableGross, "4.0");
    assert.equal(
      (await checkout.confirm({ id: "buyer" }, order.order.orderId, paid.hash))
        .confirmed,
      true,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM inventory").get() as any).n,
      2,
    );
    await assert.rejects(() =>
      checkout.quote({ id: "buyer", wallet: payer }, "moss-crown", "stable"),
    );
    db.close();
    await (await store.pause()).wait();
    const paused = make();
    await assert.rejects(async () =>
      buy.purchase.staticCall(...await withProof(paused)),
    );
    await assert.rejects(() =>
      (store.connect(buyer) as Contract).unpause.staticCall(),
    );
    await (await store.unpause()).wait();
  } finally {
    provider.destroy();
    await node.disconnect();
  }
});
