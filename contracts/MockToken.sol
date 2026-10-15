// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
/// @dev Local/testnet fixture, not the canonical launch token. All supply to deployer.
contract MockToken is ERC20 {uint8 private immutable precision;constructor(string memory n,string memory s,uint8 d) ERC20(n,s){precision=d;_mint(msg.sender,1_000_000_000*10**d);}function decimals() public view override returns(uint8){return precision;}}
