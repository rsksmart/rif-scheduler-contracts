// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
  uint256 public count = 0;

  // slither-disable-next-line locked-ether
  function inc() external payable {
    count += count + 1;
  }

  function fail() external pure {
    revert('Boom');
  }
}
