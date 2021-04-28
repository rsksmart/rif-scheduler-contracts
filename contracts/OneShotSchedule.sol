// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/IERC677TransferReceiver.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

contract OneShotSchedule is IERC677TransferReceiver, ReentrancyGuard {
  IERC677 token;
  address public payee;
  address serviceProvider;

  struct Plan {
    uint256 schegulingPrice;
    uint256 window;
    bool active;
  }

  Plan[] plans;

  mapping(address => mapping(uint256 => uint256)) remainingSchedulings;

  struct Metatransaction {
    address from;
    uint256 plan;
    address to;
    bytes data;
    uint256 gas;
    uint256 timestamp;
    uint256 value;
    bool executed;
  }

  Metatransaction[] private transactionsScheduled;

  event PlanAdded(uint256 indexed index, uint256 price, uint256 window);
  event PlanCancelled(uint256 indexed index);
  event SchedulingsPurchased(address indexed from, uint256 plan, uint256 amount);
  event MetatransactionAdded(
    uint256 indexed index,
    address indexed from,
    uint256 indexed plan,
    address to,
    bytes data,
    uint256 gas,
    uint256 timestamp,
    uint256 value
  );

  event MetatransactionExecuted(uint256 indexed index, bool success, bytes result);

  modifier onlyProvider() {
    require(address(msg.sender) == serviceProvider, 'Not authorized');
    _;
  }

  constructor(
    IERC677 _rifToken,
    address _serviceProvider,
    address _payee
  ) {
    require(_payee != address(0x0), 'Payee address cannot be 0x0');
    require(_serviceProvider != address(0x0), 'Service provider address cannot be 0x0');
    require(address(_rifToken) != address(0x0), 'Token address cannot be 0x0');
    token = _rifToken;
    serviceProvider = _serviceProvider;
    payee = _payee;
  }

  function addPlan(uint256 price, uint256 window) external onlyProvider {
    plans.push(Plan(price, window, true));
    emit PlanAdded(plans.length - 1, price, window);
  }

  function getPlan(uint256 index)
    external
    view
    returns (
      uint256 price,
      uint256 window,
      bool active
    )
  {
    price = plans[index].schegulingPrice;
    window = plans[index].window;
    active = plans[index].active;
  }

  function cancelPlan(uint256 plan) external onlyProvider {
    require(plans[plan].active, 'The plan is already inactive');
    plans[plan].active = false;
    emit PlanCancelled(plan);
  }

  function setPayee(address payable _payee) external onlyProvider {
    require(_payee != address(0x0), 'Payee address cannot be 0x0');
    payee = _payee;
  }

  function _totalPrice(uint256 plan, uint256 amount) private view returns (uint256) {
    return amount * plans[plan].schegulingPrice;
  }

  function doPurchase(
    address from,
    uint256 plan,
    uint256 schedulingAmount
  ) private {
    require(plans[plan].active, 'Inactive plan');
    remainingSchedulings[from][plan] = remainingSchedulings[from][plan] + schedulingAmount;
    emit SchedulingsPurchased(from, plan, schedulingAmount);
  }

  function purchase(uint256 plan, uint256 amount) external {
    doPurchase(msg.sender, plan, amount);
    require(token.transferFrom(msg.sender, address(this), _totalPrice(plan, amount)), "Payment did't pass");
  }

  function tokenFallback(
    address from,
    uint256 amount,
    bytes calldata data
  ) external override returns (bool) {
    require(address(token) == address(msg.sender), 'Bad token');
    uint256 plan;
    uint256 schedulingAmount;
    (plan, schedulingAmount) = abi.decode(data, (uint256, uint256));
    require(amount == _totalPrice(plan, schedulingAmount), "Transferred amount doesn't match total purchase");
    doPurchase(from, plan, schedulingAmount);
    return true;
  }

  function getRemainingSchedulings(address requestor, uint256 plan) external view returns (uint256) {
    return remainingSchedulings[requestor][plan];
  }

  function _spend(address requestor, uint256 plan) private {
    require(remainingSchedulings[requestor][plan] > 0, 'No balance available');
    remainingSchedulings[requestor][plan] = remainingSchedulings[requestor][plan] - 1;
  }

  // function _refund(address requestor, uint256 plan) private {
  //   remainingSchedulings[requestor][plan] = remainingSchedulings[requestor][plan] + 1;
  // }

  function schedule(
    uint256 plan,
    address to,
    bytes calldata data,
    uint256 gas,
    uint256 executionTime
  ) external payable {
    // slither-disable-next-line timestamp
    require(block.timestamp <= executionTime, 'Cannot schedule it in the past');
    _spend(msg.sender, plan);
    transactionsScheduled.push(Metatransaction(msg.sender, plan, to, data, gas, executionTime, msg.value, false));
    emit MetatransactionAdded(transactionsScheduled.length - 1, msg.sender, plan, to, data, gas, executionTime, msg.value);
  }

  function getSchedule(uint256 index)
    external
    view
    returns (
      address,
      uint256,
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
      metatransaction.plan,
      metatransaction.to,
      metatransaction.data,
      metatransaction.gas,
      metatransaction.timestamp,
      metatransaction.value,
      metatransaction.executed
    );
  }

  // slither-disable-next-line low-level-calls
  function execute(uint256 index) external nonReentrant {
    Metatransaction storage metatransaction = transactionsScheduled[index];

    require(!metatransaction.executed, 'Already executed');

    // Instead of just reverting, here we should:
    // - give the requestor a refund
    // - penalize the service provider

    // slither-disable-next-line timestamp
    require(metatransaction.timestamp - (plans[metatransaction.plan].window) < block.timestamp, 'Too soon');
    // slither-disable-next-line timestamp
    require(metatransaction.timestamp + (plans[metatransaction.plan].window) > block.timestamp, 'Too late');

    // We can use gasleft() here to charge the consumer for the gas
    // A contract may hold user's gas and charge it after executing
    // the transaction

    metatransaction.executed = true;

    // Now failing transactions are forwarded. Is responsability of the requestor
    // to list a valid transaction

    (bool success, bytes memory result) =
      metatransaction.to.call{ gas: metatransaction.gas, value: metatransaction.value }(metatransaction.data);
    // slither-disable-next-line reentrancy-events
    emit MetatransactionExecuted(index, success, result);
    // The difference when calling gasleft() again is (aprox.) the gas used
    // in the call

    // After executing we do the payout to the service provider:
    // - return the gas used
    // - send the tokens paid for the service
    token.transfer(payee, plans[metatransaction.plan].schegulingPrice);
  }
}
