import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
export const config = {
  port: Number(process.env.PORT || 3000),
  db: process.env.DB_PATH || "data/outpost.sqlite",
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  production: process.env.NODE_ENV === "production",
  roundMs: Number(process.env.ROUND_SECONDS || 40) * 1000,
  chainId: Number(process.env.CHAIN_ID || 46630),
  rpc: process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com",
  store: process.env.STORE_ADDRESS || "",
  token: process.env.TOKEN_ADDRESS || "",
  stable: process.env.STABLE_ADDRESS || "",
  signer: process.env.QUOTE_SIGNER_PRIVATE_KEY || "",
  marketMode: process.env.MARKET_MODE || "scenario",
  symbol: process.env.MARKET_SYMBOL || "NVDA",
  confirmations: Number(process.env.CONFIRMATIONS || 3),
  tokenUnitsPerDollar: process.env.TOKEN_UNITS_PER_DOLLAR || "",
  tokenDecimals: Number(process.env.TOKEN_DECIMALS || 18),
  stableDecimals: Number(process.env.STABLE_DECIMALS || 6),
};
if (
  !Number.isFinite(config.port) ||
  config.roundMs < 1000 ||
  !Number.isFinite(config.roundMs)
)
  throw Error("Invalid port or round duration");
if (config.production && !config.origin.startsWith("https://"))
  throw Error("Production APP_ORIGIN must use HTTPS");
export type Config = typeof config;
