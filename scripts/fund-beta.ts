import "../server/config";
import { readFileSync } from "node:fs";
import { Contract, JsonRpcProvider, Wallet, getAddress, parseUnits } from "ethers";
import { ERC20_ABI } from "../shared/checkout";

const deployment = JSON.parse(readFileSync("deployments/46630.json", "utf8"));
if (deployment.chain !== 46630 || deployment.mock !== true)
  throw Error("Only a recorded Robinhood testnet mock deployment can be funded");
const recipient = getAddress(process.env.BETA_WALLET_ADDRESS || "");
const provider = new JsonRpcProvider(process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com");
try {
  if (Number((await provider.getNetwork()).chainId) !== 46630) throw Error("Expected Robinhood testnet 46630");
  const amounts = [
    { address: deployment.token, units: parseUnits(process.env.BETA_RIVAL_AMOUNT || "200", 18), ticker: "tRIVAL" },
    { address: deployment.stable, units: parseUnits(process.env.BETA_USDG_AMOUNT || "50", 6), ticker: "tUSDG" },
  ];
  if (amounts.some(a => a.units <= 0n)) throw Error("Amounts must be positive");
  if (!process.argv.includes("--broadcast")) {
    console.log({ dryRun: true, chain: 46630, recipient, tokens: amounts.map(a => ({ token: a.address, ticker: a.ticker, units: a.units.toString() })) });
  } else {
    const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", provider);
    for (const item of amounts) {
      const asset = new Contract(item.address, ERC20_ABI.concat(["function transfer(address,uint256) returns(bool)"]), wallet);
      if (await asset.balanceOf(wallet.address) < item.units) throw Error("Deployer lacks " + item.ticker);
      const receipt = await (await asset.transfer(recipient, item.units)).wait();
      if (receipt?.status !== 1) throw Error("Transfer failed for " + item.ticker);
      console.log(`${item.ticker}: https://explorer.testnet.chain.robinhood.com/tx/${receipt.hash}`);
    }
  }
} finally { provider.destroy(); }
