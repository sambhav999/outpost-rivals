// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
/// @notice Cosmetic checkout only. No yield, staking, gameplay power or token minting.
contract OutpostStore is EIP712, Ownable, Pausable, ReentrancyGuard {
 using SafeERC20 for IERC20;
 address public immutable token; address public immutable stable; address public immutable treasury;
 address public quoteSigner;
 address public constant RETIREMENT = 0x000000000000000000000000000000000000dEaD;
 bytes32 public constant ORDER_TYPEHASH=keccak256('Order(bytes32 orderId,address payer,address asset,uint256 amount,uint256 priceUsd6,bytes32 sku,address creator,uint256 expires)');
 bytes32 public constant PRICE_CHECK_TYPEHASH=keccak256('PriceCheck(bytes32 orderId,uint256 priceUsd6,uint256 observedAt,uint256 expires)');
 uint16 public constant priceGuardVersion=1;
 uint256 public constant MAX_PRICE_MOVE_BPS=300;
 struct Order {bytes32 orderId;address payer;address asset;uint256 amount;uint256 priceUsd6;bytes32 sku;address creator;uint256 expires;}
 struct PriceCheck {bytes32 orderId;uint256 priceUsd6;uint256 observedAt;uint256 expires;}
 mapping(bytes32=>bool) public consumed;
 mapping(address=>mapping(bytes32=>bool)) public purchasedSku;
 event Purchased(bytes32 indexed orderId,address indexed payer,bytes32 indexed sku,address asset,uint256 amount,address creator,uint256 retired,uint256 treasuryPaid,uint256 creatorPaid);
 event SignerChanged(address indexed signer);
 constructor(address token_,address stable_,address treasury_,address signer_,address owner_) EIP712('OutpostStore','2') Ownable(owner_) {
  require(token_.code.length>0&&stable_.code.length>0&&token_!=stable_,'assets');require(treasury_!=address(0)&&signer_!=address(0),'addresses');token=token_;stable=stable_;treasury=treasury_;quoteSigner=signer_;
 }
 function setQuoteSigner(address signer) external onlyOwner {require(signer!=address(0),'signer');quoteSigner=signer;emit SignerChanged(signer);}
 function pause() external onlyOwner {_pause();}function unpause() external onlyOwner {_unpause();}
 function _checkPrice(Order calldata o,PriceCheck calldata priceCheck,bytes calldata checkSignature) internal view {
  if(o.asset==token){
   require(o.priceUsd6>0&&priceCheck.orderId==o.orderId&&priceCheck.priceUsd6>0,'price');
   require(priceCheck.observedAt<=block.timestamp+5&&priceCheck.expires>=block.timestamp&&priceCheck.expires<=priceCheck.observedAt+20&&priceCheck.expires<=o.expires,'price expired');
   require(priceCheck.priceUsd6*10000>=o.priceUsd6*(10000-MAX_PRICE_MOVE_BPS)&&priceCheck.priceUsd6*10000<=o.priceUsd6*(10000+MAX_PRICE_MOVE_BPS),'price moved');
   bytes32 ph=keccak256(abi.encode(PRICE_CHECK_TYPEHASH,priceCheck.orderId,priceCheck.priceUsd6,priceCheck.observedAt,priceCheck.expires));
   require(ECDSA.recover(_hashTypedDataV4(ph),checkSignature)==quoteSigner,'price signature');
  } else require(o.priceUsd6==0,'stable price');
 }
 function purchase(Order calldata o,bytes calldata signature,PriceCheck calldata priceCheck,bytes calldata checkSignature) external nonReentrant whenNotPaused {
  require(msg.sender==o.payer,'payer');require(o.asset==token||o.asset==stable,'asset');require(o.amount>0&&o.expires>=block.timestamp,'expired or zero');require(!consumed[o.orderId],'consumed');require(!purchasedSku[o.payer][o.sku],'already purchased');
  bytes32 h=keccak256(abi.encode(ORDER_TYPEHASH,o.orderId,o.payer,o.asset,o.amount,o.priceUsd6,o.sku,o.creator,o.expires));require(ECDSA.recover(_hashTypedDataV4(h),signature)==quoteSigner,'signature');
  _checkPrice(o,priceCheck,checkSignature);
  consumed[o.orderId]=true;purchasedSku[o.payer][o.sku]=true;
  IERC20 asset=IERC20(o.asset);uint256 beforeBalance=asset.balanceOf(address(this));asset.safeTransferFrom(msg.sender,address(this),o.amount);require(asset.balanceOf(address(this))-beforeBalance==o.amount,'transfer tax unsupported');
  uint256 retired=o.asset==token?o.amount*(o.creator==address(0)?2000:200)/10000:0;
  uint256 creatorPaid=o.creator==address(0)?0:o.amount*9000/10000;uint256 treasuryPaid=o.amount-retired-creatorPaid;
  if(retired>0)asset.safeTransfer(RETIREMENT,retired);if(creatorPaid>0)asset.safeTransfer(o.creator,creatorPaid);if(treasuryPaid>0)asset.safeTransfer(treasury,treasuryPaid);
  emit Purchased(o.orderId,o.payer,o.sku,o.asset,o.amount,o.creator,retired,treasuryPaid,creatorPaid);
 }
}
