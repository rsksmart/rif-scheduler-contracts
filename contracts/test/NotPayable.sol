// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract NotPayable {
  fallback() external payable {
    revert('Boom');
  }

  receive() external payable {
    revert('Boom');
  }
}
