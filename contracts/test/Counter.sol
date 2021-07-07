// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
  uint256 public count = 0;
  event Counted(uint256 counted);

  // slither-disable-next-line locked-ether
  function inc() external payable {
    count++;
    emit Counted(count);
  }

  function fail() external pure {
    revert('Boom');
  }
}
