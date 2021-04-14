// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;
import "@rsksmart/erc677/contracts/IERC677.sol";
// import "@rsksmart/erc677/contracts/IERC677Receiver.sol";

contract OneShotSchedule {
  uint window;
  IERC677 token; 
  uint price;

  mapping(address => uint) remainingSchedulings;
  
  struct Metatransaction {
    address from;
    address to;
    bytes data;
    uint gas;
    uint timestamp;
    uint value;
    bool executed;
  }

  Metatransaction[] private bag;

  event MetatransactionAdded(uint indexed index, address to, bytes data, uint gas, uint timestamp, uint value);
  event MetatransactionExecuted(uint indexed index, bool succes, bytes result);

  constructor(IERC677 _rifToken, address _providerAccount, uint _price, uint _window) public {
    window = _window;
    token = _rifToken;
    price = _price;
    window = _window;
  }

  function _totalPrice(uint _amount) private returns (uint){
    return _amount * price;
  }

  function purchase(uint _amount) public {
    //require(token.allowance(msg.sender, address(this)) >= _totalPrice(_amount), 'Allowance Excedeed');
    token.transferFrom(msg.sender, address(this), _totalPrice(_amount));
    remainingSchedulings[msg.sender] += _amount ;
  }

  function getRemainingSchedulings(address _requestor) public view returns(uint){
    return remainingSchedulings[_requestor];
  }

  function spend(address _requestor) private {
    require(remainingSchedulings[_requestor] > 0);
    remainingSchedulings[_requestor] = remainingSchedulings[msg.sender] - 1;
  }

  function schedule(address to, bytes memory data, uint gas, uint timestamp) public payable {
    // We should charge the user for the execution. Refund is given if service provider
    // fails to execute the transaction

    // Important! Check the schedule is not for the past
    bag.push(Metatransaction(msg.sender,to, data, gas, timestamp, msg.value, false));
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
    (bool success, bytes memory result) = metatransaction.to.call.gas(metatransaction.gas).value( metatransaction.value)(metatransaction.data);

    // The difference when calling gasleft() again is (aprox.) the gas used
    // in the call

    metatransaction.executed = true;

    // After executing we do the payout to the service provider:
    // - return the gas used
    // - send the tokens paid for the service

    emit MetatransactionExecuted(index, success, result);
  }
}
