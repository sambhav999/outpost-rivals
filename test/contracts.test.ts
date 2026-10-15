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
import { ORDER_TYPES } from "../shared/checkout";
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
        version: "1",
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
      sku: id("moss-crown"),
      creator: ZeroAddress,
      expires: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    });
    const sign = (o: any, w = quoteSigner) =>
      w.signTypedData(domain, ORDER_TYPES, o);
    const buy = store.connect(buyer) as Contract;
    const o = make(),
      sig = await sign(o);
    await (await buy.purchase(o, sig)).wait();
    assert.equal(
      await token.balanceOf("0x000000000000000000000000000000000000dEaD"),
      parseEther("20"),
    );
    assert.equal(
      await token.balanceOf(await treasury.getAddress()),
      parseEther("80"),
    );
    assert.equal(await token.balanceOf(address), 0n);
    await assert.rejects(() => buy.purchase.staticCall(o, sig));
    const wrong = make();
    await assert.rejects(async () =>
      buy.purchase.staticCall(wrong, await sign(wrong, Wallet.createRandom())),
    );
    const expired = make({ expires: 1 });
    await assert.rejects(async () =>
      buy.purchase.staticCall(expired, await sign(expired)),
    );
    const badAsset = make({ asset: await creator.getAddress() });
    await assert.rejects(async () =>
      buy.purchase.staticCall(badAsset, await sign(badAsset)),
    );
    const fresh = make();
    await assert.rejects(async () =>
      store.purchase.staticCall(fresh, await sign(fresh)),
    );
    await assert.rejects(async () =>
      buy.purchase.staticCall(
        fresh,
        await quoteSigner.signTypedData(
          { ...domain, chainId: 4663 },
          ORDER_TYPES,
          fresh,
        ),
      ),
    );
    const co = make({ creator: await creator.getAddress() });
    await (await buy.purchase(co, await sign(co))).wait();
    assert.equal(
      await token.balanceOf(await creator.getAddress()),
      parseEther("90"),
    );
    assert.equal(
      await token.balanceOf(await treasury.getAddress()),
      parseEther("88"),
    );
    const so = make({ asset: stable.target, amount: 4000000n });
    await (await buy.purchase(so, await sign(so))).wait();
    assert.equal(await stable.balanceOf(await treasury.getAddress()), 4000000n);
    const db = database(":memory:");
    db.prepare("INSERT INTO users(id,name,wallet) VALUES (?,?,?)").run(
      "buyer",
      "Buyer",
      payer.toLowerCase(),
    );
    const checkout = shop(
      db,
      {
        ...config,
        chainId: 46630,
        store: address,
        token: await token.getAddress(),
        stable: await stable.getAddress(),
        signer: quoteSigner.privateKey,
        confirmations: 1,
        tokenUnitsPerDollar: "10",
      },
      provider as any,
    );
    assert.equal((await checkout.check()).enabled, true);
    const order = await checkout.quote(
      { id: "buyer", wallet: payer },
      "moss-crown",
      "stable",
    );
    const paid = await buy.purchase(order.order, order.signature);
    await paid.wait();
    assert.equal(
      (await checkout.confirm({ id: "buyer" }, order.order.orderId, paid.hash))
        .confirmed,
      true,
    );
    assert.equal(
      (await checkout.confirm({ id: "buyer" }, order.order.orderId, paid.hash))
        .confirmed,
      true,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM inventory").get() as any).n,
      1,
    );
    await assert.rejects(() =>
      checkout.quote({ id: "buyer", wallet: payer }, "moss-crown", "stable"),
    );
    db.close();
    await (await store.pause()).wait();
    const paused = make();
    await assert.rejects(async () =>
      buy.purchase.staticCall(paused, await sign(paused)),
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
