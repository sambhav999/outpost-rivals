import { config } from "../server/config";
import { JsonRpcProvider, Contract, Wallet } from "ethers";
import { STORE_ABI, ERC20_ABI } from "../shared/checkout";
const p = new JsonRpcProvider(config.rpc);
const chain = Number((await p.getNetwork()).chainId);
if (chain !== config.chainId) throw Error("Wrong network");
for (const a of [config.token, config.stable, config.store])
  if (!a || (await p.getCode(a)) === "0x")
    throw Error("Missing deployed contract: " + a);
const s = new Contract(config.store, STORE_ABI, p);
if (
  (await s.token()).toLowerCase() !== config.token.toLowerCase() ||
  (await s.stable()).toLowerCase() !== config.stable.toLowerCase()
)
  throw Error("Asset mismatch");
if (await s.paused()) throw Error("Store paused");
if (
  config.signer &&
  (await s.quoteSigner()).toLowerCase() !==
    new Wallet(config.signer).address.toLowerCase()
)
  throw Error("Wrong signer");
for (const [a, d] of [
  [config.token, config.tokenDecimals],
  [config.stable, config.stableDecimals],
] as const)
  if (Number(await new Contract(a, ERC20_ABI, p).decimals()) !== d)
    throw Error("Decimals mismatch");
console.log({
  network: chain,
  store: config.store,
  treasury: await s.treasury(),
  signer: await s.quoteSigner(),
  tokenSupply: (
    await new Contract(config.token, ERC20_ABI, p).totalSupply()
  ).toString(),
  status: "Contract configuration checks passed. This is not a security audit.",
});
p.destroy();
