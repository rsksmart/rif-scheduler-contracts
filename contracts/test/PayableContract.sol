// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PayableContract {
  event Log(uint256 gas);
  uint256 count;

  // Fallback function must be declared as external.
  fallback() external payable {
    //spend some gas
    for (uint256 i = 0; i < 100; i++) {
      count++;
    }
    //call (forwards all of the gas)
    emit Log(gasleft());
  }

  receive() external payable {
    // spend some gas here too
    for (uint256 i = 0; i < 100; i++) {
      count++;
    }
    //call (forwards all of the gas)
    emit Log(gasleft());
  }

  // Helper function to check the balance of this contract
  function getBalance() public view returns (uint256) {
    return address(this).balance;
  }
}
