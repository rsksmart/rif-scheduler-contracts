// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract Counter {
  uint256 public count = 0;

  function inc() public payable {
    count += count + 1;
  }

  function fail() public pure {
    revert('Boom');
  }
}
