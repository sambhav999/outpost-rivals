export const ORDER_TYPES = {
  Order: [
    { name: "orderId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "sku", type: "bytes32" },
    { name: "creator", type: "address" },
    { name: "expires", type: "uint256" },
  ],
};
export const STORE_ABI = [
  "function purchase((bytes32 orderId,address payer,address asset,uint256 amount,bytes32 sku,address creator,uint256 expires) order,bytes signature)",
  "function quoteSigner() view returns(address)",
  "function token() view returns(address)",
  "function stable() view returns(address)",
  "function treasury() view returns(address)",
  "function paused() view returns(bool)",
  "event Purchased(bytes32 indexed orderId,address indexed payer,bytes32 indexed sku,address asset,uint256 amount,address creator,uint256 retired,uint256 treasuryPaid,uint256 creatorPaid)",
];
export const ERC20_ABI = [
  "function approve(address,uint256) returns(bool)",
  "function allowance(address,address) view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function totalSupply() view returns(uint256)",
];
