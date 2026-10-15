export const SHOP_ITEMS = [
  {
    id: "moss-crown",
    name: "Mossbound Captain",
    category: "Captain attire",
    priceCents: 400,
    color: "#b9d78a",
    description: "A golden leaf crown for your captain. Purely cosmetic.",
    kind: "skin",
  },
  {
    id: "ember-standard",
    name: "Ember Standard",
    category: "Faction banner",
    priceCents: 600,
    color: "#e9a477",
    description:
      "Carry a copper standard across the frontier. Purely cosmetic.",
    kind: "banner",
  },
  {
    id: "moonwatch",
    name: "Moonwatch",
    category: "World atmosphere",
    priceCents: 800,
    color: "#b1a5db",
    description:
      "A personal moonlit palette for your battlefield. Purely cosmetic.",
    kind: "theme",
  },
  {
    id: "founder-seal",
    name: "First Frontier",
    category: "Captain insignia",
    priceCents: 1200,
    color: "#e4d3a5",
    description:
      "A golden insignia ring around your captain. No gameplay advantage.",
    kind: "badge",
  },
] as const;
export const ECONOMY = {
  supply: "1000000000",
  token: "RIVAL",
  firstParty: { retiredBps: 2000, treasuryBps: 8000 },
  creator: { creatorBps: 9000, treasuryBps: 800, retiredBps: 200 },
  stableFirstParty: { treasuryBps: 10000 },
  stableCreator: { creatorBps: 9000, treasuryBps: 1000 },
};
export function splitPayment(
  amount: bigint,
  asset: "rival" | "stable",
  creator = false,
) {
  if (amount <= 0n) throw Error("Positive amount required");
  const creatorAmount = creator ? (amount * 9000n) / 10000n : 0n;
  const retired =
    asset === "rival" ? (amount * BigInt(creator ? 200 : 2000)) / 10000n : 0n;
  return {
    creator: creatorAmount,
    retired,
    treasury: amount - creatorAmount - retired,
  };
}
export const RH_MAINNET = {
  chainId: 4663,
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  stable: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
};
export const RH_TESTNET = {
  chainId: 46630,
  name: "Robinhood Chain Testnet",
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
  stable: "",
};
