// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract InfiniteLoop {
  uint256 public count = 0;

  function loopForEver() external payable {
    while(true){
        count++;
    }
  }

    // Fallback loops.
    fallback() external payable {
        this.loopForEver();
    }

    receive() external payable {
        this.loopForEver();
    }
}