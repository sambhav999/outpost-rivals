import "../server/config";
import { JsonRpcProvider, Wallet, ContractFactory, getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "node:fs";
import { compile } from "./compile";
const chain = Number(process.env.CHAIN_ID || 46630),
  rpc = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
if (![4663, 46630].includes(chain)) throw Error("Unsupported chain");
const p = new JsonRpcProvider(rpc);
if (Number((await p.getNetwork()).chainId) !== chain)
  throw Error("RPC chain mismatch");
const compiled = compile(),
  mock = process.argv.includes("--testnet-mocks");
if (mock && chain === 4663) throw Error("Mock assets are forbidden on mainnet");
const owner = getAddress(process.env.OWNER_ADDRESS || ""),
  treasury = getAddress(process.env.TREASURY_ADDRESS || ""),
  signer = getAddress(process.env.QUOTE_SIGNER_ADDRESS || "");
if (!process.argv.includes("--broadcast")) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        chain,
        owner,
        treasury,
        signer,
        mock,
        token: process.env.TOKEN_ADDRESS,
        stable: process.env.STABLE_ADDRESS,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", p);
let token = process.env.TOKEN_ADDRESS || "",
  stable = process.env.STABLE_ADDRESS || "";
async function deploy(name: string, args: any[]) {
  const contract = await new ContractFactory(
    compiled[name].abi,
    compiled[name].bytecode,
    wallet,
  ).deploy(...args);
  await contract.waitForDeployment();
  return await contract.getAddress();
}
if (mock) {
  token = await deploy("MockToken", ["Test Outpost Rivals", "tRIVAL", 18]);
  stable = await deploy("MockToken", ["Test Dollar", "tUSDG", 6]);
}
const store = await deploy("OutpostStore", [
  getAddress(token),
  getAddress(stable),
  treasury,
  signer,
  owner,
]);
mkdirSync("deployments", { recursive: true });
const out = {
  chain,
  token,
  stable,
  store,
  owner,
  treasury,
  quoteSigner: signer,
  mock,
  created: new Date().toISOString(),
};
writeFileSync(`deployments/${chain}.json`, JSON.stringify(out, null, 2));
console.log(out);
p.destroy();
