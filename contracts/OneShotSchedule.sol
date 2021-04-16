// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;
import "@rsksmart/erc677/contracts/IERC677.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
// import "@rsksmart/erc677/contracts/IERC677Receiver.sol";

contract OneShotSchedule {
  using SafeMath for uint;
  using SafeMath for uint64;

  uint window;
  IERC677 token; 
  address providerAccount;
  uint price;

  mapping(address => uint) remainingSchedulings;
  
  struct Metatransaction {
    address from;
    address to;
    bytes data;
    uint gas;
    uint64 timestamp;
    uint value;
    bool executed;
  }

  Metatransaction[] private transactionsScheduled;

  event SchedulingsPurchased(address indexed from, uint amount);
  event MetatransactionAdded(uint indexed index, address indexed from, address indexed to, bytes data, uint gas, uint64 timestamp, uint value);
  event MetatransactionExecuted(uint indexed index, bool succes, bytes result);

  constructor(IERC677 _rifToken, address _providerAccount, uint _price, uint _window) public {
    window = _window;
    token = _rifToken;
    price = _price;
    window = _window;
    providerAccount = _providerAccount;
  }

  function _totalPrice(uint _amount) private view returns (uint){
    return _amount.mul(price);
  }

  function purchase(uint _amount) public {
    require(token.allowance(msg.sender, address(this)) >= _totalPrice(_amount), 'Allowance Excedeed');
    token.transferFrom(msg.sender, address(this), _totalPrice(_amount));
    remainingSchedulings[msg.sender] = remainingSchedulings[msg.sender].add(_amount);
    emit SchedulingsPurchased(msg.sender, _amount);
  }

  function tokenFallback(address _from, uint256 _amount, bytes calldata _data) external returns(bool) {
    require(address(token) == address(msg.sender),"Bad token");
    uint _schedulingAmount = abi.decode(_data, ( uint));
    require(_amount == _totalPrice(_schedulingAmount), "Transferred amount doens't match total purchase");
    remainingSchedulings[_from] = remainingSchedulings[_from].add(_schedulingAmount);
    emit SchedulingsPurchased(_from, _schedulingAmount);
    return true;
  }

  function getRemainingSchedulings(address _requestor) public view returns(uint){
    return remainingSchedulings[_requestor];
  }

  function _spend(address _requestor) private {
    require(remainingSchedulings[_requestor] > 0, 'No balance available');
    remainingSchedulings[_requestor] = remainingSchedulings[_requestor].sub(1);
  }

  function _refund(address _requestor) private {
    remainingSchedulings[_requestor] = remainingSchedulings[_requestor].add(1);
  }

  function schedule(address to, bytes memory data, uint gas, uint64 executionTime) public payable {
    require(block.timestamp <= executionTime, 'Cannot schedule in past');
    _spend(msg.sender);
    transactionsScheduled.push(Metatransaction(msg.sender,to, data, gas, executionTime, msg.value, false));
    emit MetatransactionAdded(transactionsScheduled.length - 1, msg.sender, to, data, gas, executionTime, msg.value);
  }

  function getSchedule(uint index) public view returns(address, address, bytes memory, uint, uint64, uint, bool) {
    Metatransaction memory metatransaction = transactionsScheduled[index];
    return (metatransaction.from, metatransaction.to, metatransaction.data, metatransaction.gas, metatransaction.timestamp, metatransaction.value, metatransaction.executed);
  }

  function execute(uint index) public {
    Metatransaction storage metatransaction = transactionsScheduled[index];

    require(!metatransaction.executed, "Already executed");

    // Instead of just reverting, here we should:
    // - give the requestor a refund
    // - penalize the service provider
    require(metatransaction.timestamp.sub(window) < block.timestamp, "Too soon");
    require(metatransaction.timestamp.add(window) >  block.timestamp, "Too late");

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
