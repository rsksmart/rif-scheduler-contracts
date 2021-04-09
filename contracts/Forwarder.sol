// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract Forwarder {
  struct Metatransaction {
    address to;
    bytes data;
    uint gas;
    uint value;
    bool executed;
  }

  Metatransaction[] private bag;

  event MetatransactionAdded(uint indexed index, address to, bytes data, uint gas, uint value);
  event MetatransactionExecuted(uint indexed index, bytes result);

  function add(address to, bytes memory data, uint gas) public payable {
    bag.push(Metatransaction(to, data, gas, msg.value, false));
    emit MetatransactionAdded(bag.length - 1, to, data, gas, msg.value);
  }

  function at(uint index) public view returns(address, bytes memory, uint, uint, bool) {
    Metatransaction memory metatransaction = bag[index];
    return (metatransaction.to, metatransaction.data, metatransaction.gas, metatransaction.value, metatransaction.executed);
  }

  function execute(uint index) public {
    Metatransaction storage metatransaction = bag[index];

    require(!metatransaction.executed, "Already executed");

    (bool success, bytes memory result) = metatransaction.to.call{ gas: metatransaction.gas, value: metatransaction.value }(metatransaction.data);

    require(success, string(result));

    metatransaction.executed = true;

    emit MetatransactionExecuted(index, result);
  }
}
