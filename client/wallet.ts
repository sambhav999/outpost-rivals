import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";

export const robinhoodTestnet: Chain = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
};
export const robinhoodMainnet: Chain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
};

const chains: readonly [Chain, ...Chain[]] = import.meta.env.VITE_CHAIN_ID === "4663"
  ? [robinhoodMainnet, robinhoodTestnet]
  : [robinhoodTestnet, robinhoodMainnet];
const transports = {
  [robinhoodTestnet.id]: http(import.meta.env.VITE_TESTNET_RPC_URL || robinhoodTestnet.rpcUrls.default.http[0]),
  [robinhoodMainnet.id]: http(import.meta.env.VITE_MAINNET_RPC_URL || robinhoodMainnet.rpcUrls.default.http[0]),
};

// WalletConnect Cloud ID enables the full RainbowKit mobile wallet list.
// Without it, injected wallets remain usable and guests can still play.
export const walletConfig = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
  ? getDefaultConfig({
      appName: "Outpost Rivals",
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
      chains,
      transports,
    })
  : createConfig({ chains, connectors: [injected()], transports });
export const walletConnectEnabled = !!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
