// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract Forwarder {
  uint window;

  struct Metatransaction {
    address to;
    bytes data;
    uint gas;
    uint timestamp;
    uint value;
    bool executed;
  }

  constructor(uint _window) {
    window = _window;
  }

  Metatransaction[] private bag;

  event MetatransactionAdded(uint indexed index, address to, bytes data, uint gas, uint timestamp, uint value);
  event MetatransactionExecuted(uint indexed index, bool succes, bytes result);

  function schedule(address to, bytes memory data, uint gas, uint timestamp) public payable {
    // We should charge the user for the execution. Refund is given if service provider
    // fails to execute the transaction

    // Important! Check the schedule is not for the past
    bag.push(Metatransaction(to, data, gas, timestamp, msg.value, false));
    emit MetatransactionAdded(bag.length - 1, to, data, gas, timestamp, msg.value);
  }

  function getSchedule(uint index) public view returns(address, bytes memory, uint, uint, uint, bool) {
    Metatransaction memory metatransaction = bag[index];
    return (metatransaction.to, metatransaction.data, metatransaction.gas, metatransaction.timestamp, metatransaction.value, metatransaction.executed);
  }

  function execute(uint index) public {
    Metatransaction storage metatransaction = bag[index];

    require(!metatransaction.executed, "Already executed");

    // Instead of just reverting, here we should:
    // - give the requestor a refund
    // - penalize the service provider
    require(metatransaction.timestamp - window < block.timestamp, "Too soon");
    require(metatransaction.timestamp + window > block.timestamp, "Too late");

    // We can use gasleft() here to charge the consumer for the gas
    // A contract may hold user's gas and charge it after executing
    // the transaction

    // Now failing transactions are forwarded. Is responsability of the requestor
    // to list a valid transaction
    (bool success, bytes memory result) = metatransaction.to.call{ gas: metatransaction.gas, value: metatransaction.value }(metatransaction.data);

    // The difference when calling gasleft() again is (aprox.) the gas used
    // in the call

    metatransaction.executed = true;

    // After executing we do the payout to the service provider:
    // - return the gas used
    // - send the tokens paid for the service

    emit MetatransactionExecuted(index, success, result);
  }
}
