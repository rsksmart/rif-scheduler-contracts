// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/ERC677TransferReceiver.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';

contract OneShotSchedule is ERC677TransferReceiver {
  using SafeMath for uint256;
  uint256 window;
  IERC677 token;
  address providerAccount;
  uint256 price;

  mapping(address => uint256) remainingSchedulings;

  struct Metatransaction {
    address from;
    address to;
    bytes data;
    uint256 gas;
    uint256 timestamp;
    uint256 value;
    bool executed;
  }

  Metatransaction[] private transactionsScheduled;

  event SchedulingsPurchased(address indexed from, uint256 amount);
  event MetatransactionAdded(
    uint256 indexed index,
    address indexed from,
    address indexed to,
    bytes data,
    uint256 gas,
    uint256 timestamp,
    uint256 value
  );
  event MetatransactionExecuted(uint256 indexed index, bool succes, bytes result);

  constructor(
    IERC677 _rifToken,
    address _providerAccount,
    uint256 _price,
    uint256 _window
  ) public {
    require(_providerAccount != address(0x0), "Provider's address cannot be 0x0");
    require(address(_rifToken) != address(0x0), "Provider's address cannot be 0x0");
    window = _window;
    token = _rifToken;
    price = _price;
    window = _window;
    providerAccount = _providerAccount;
  }

  function _totalPrice(uint256 amount) private view returns (uint256) {
    return amount.mul(price);
  }

  function doPurchase(address from, uint256 schedulingAmount) private {
    remainingSchedulings[from] = remainingSchedulings[from].add(schedulingAmount);
    emit SchedulingsPurchased(from, schedulingAmount);
  }

  function purchase(uint256 amount) external {
    doPurchase(msg.sender, amount);
    require(token.transferFrom(msg.sender, address(this), _totalPrice(amount)), "Payment did't pass");
  }

  function tokenFallback(
    address from,
    uint256 amount,
    bytes calldata data
  ) external returns (bool) {
    require(address(token) == address(msg.sender), 'Bad token');
    uint256 schedulingAmount = abi.decode(data, (uint256));
    require(amount == _totalPrice(schedulingAmount), "Transferred amount doesn't match total purchase");
    doPurchase(from, schedulingAmount);
    return true;
  }

  function getRemainingSchedulings(address requestor) external view returns (uint256) {
    return remainingSchedulings[requestor];
  }

  function _spend(address requestor) private {
    require(remainingSchedulings[requestor] > 0, 'No balance available');
    remainingSchedulings[requestor] = remainingSchedulings[requestor].sub(1);
  }

  function _refund(address requestor) private {
    remainingSchedulings[requestor] = remainingSchedulings[requestor].add(1);
  }

  function schedule(
    address to,
    bytes memory data,
    uint256 gas,
    uint256 executionTime
  ) public payable {
    require(block.timestamp <= executionTime, 'Cannot schedule it in the past');
    _spend(msg.sender);
    transactionsScheduled.push(Metatransaction(msg.sender, to, data, gas, executionTime, msg.value, false));
    emit MetatransactionAdded(transactionsScheduled.length - 1, msg.sender, to, data, gas, executionTime, msg.value);
  }

  function getSchedule(uint256 index)
    external
    view
    returns (
      address,
      address,
      bytes memory,
      uint256,
      uint256,
      uint256,
      bool
    )
  {
    Metatransaction memory metatransaction = transactionsScheduled[index];
    return (
      metatransaction.from,
      metatransaction.to,
      metatransaction.data,
      metatransaction.gas,
      metatransaction.timestamp,
      metatransaction.value,
      metatransaction.executed
    );
  }

  function execute(uint256 index) public {
    Metatransaction storage metatransaction = transactionsScheduled[index];

    require(!metatransaction.executed, 'Already executed');

    // Instead of just reverting, here we should:
    // - give the requestor a refund
    // - penalize the service provider
    require(metatransaction.timestamp.sub(window) < block.timestamp, 'Too soon');
    require(metatransaction.timestamp.add(window) > block.timestamp, 'Too late');

    // We can use gasleft() here to charge the consumer for the gas
    // A contract may hold user's gas and charge it after executing
    // the transaction

    metatransaction.executed = true;

    // Now failing transactions are forwarded. Is responsability of the requestor
    // to list a valid transaction

    (bool success, bytes memory result) =
      metatransaction.to.call.gas(metatransaction.gas).value(metatransaction.value)(metatransaction.data);

    // The difference when calling gasleft() again is (aprox.) the gas used
    // in the call

    // After executing we do the payout to the service provider:
    // - return the gas used
    // - send the tokens paid for the service
    emit MetatransactionExecuted(index, success, result);
  }
}
