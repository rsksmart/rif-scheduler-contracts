// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/IERC677TransferReceiver.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

contract OneShotSchedule is IERC677TransferReceiver, ReentrancyGuard {
  address public payee;
  address serviceProvider;

  struct Plan {
    uint256 schegulingPrice;
    uint256 window;
    IERC677 token;
    bool active;
  }

  Plan[] plans;

  mapping(address => mapping(uint256 => uint256)) remainingSchedulings;
  enum MetatransactionState { Scheduled, ExecutionSuccessful, ExecutionFailed, Overdue, Refunded, Cancelled }

  struct Metatransaction {
    address payable requestor;
    uint256 plan;
    address payable to;
    bytes data;
    uint256 gas;
    uint256 timestamp;
    uint256 value;
    MetatransactionState state;
  }

  Metatransaction[] private transactionsScheduled;

  event PlanAdded(uint256 indexed index, uint256 price, address token, uint256 window);
  event PlanCancelled(uint256 indexed index);
  event SchedulingsPurchased(address indexed requestor, uint256 plan, uint256 amount);
  event MetatransactionAdded(
    uint256 indexed index,
    address indexed requestor,
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

  constructor(address serviceProvider_, address payee_) {
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    require(serviceProvider_ != address(0x0), 'Service provider address cannot be 0x0');
    serviceProvider = serviceProvider_;
    payee = payee_;
  }

  function addPlan(
    uint256 price,
    uint256 window,
    IERC677 token
  ) external onlyProvider {
    require(address(token) != address(0x0), 'Token address cannot be 0x0');
    plans.push(Plan(price, window, token, true));
    emit PlanAdded(plans.length - 1, price, address(token), window);
  }

  function getPlan(uint256 index)
    external
    view
    returns (
      uint256 price,
      uint256 window,
      address token,
      bool active
    )
  {
    price = plans[index].schegulingPrice;
    window = plans[index].window;
    token = address(plans[index].token);
    active = plans[index].active;
  }

  function cancelPlan(uint256 plan) external onlyProvider {
    require(plans[plan].active, 'The plan is already inactive');
    plans[plan].active = false;
    emit PlanCancelled(plan);
  }

  function setPayee(address payee_) external onlyProvider {
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    payee = payee_;
  }

  function totalPrice(uint256 plan, uint256 amount) private view returns (uint256) {
    return amount * plans[plan].schegulingPrice;
  }

  function doPurchase(
    address requestor,
    uint256 plan,
    uint256 schedulingAmount
  ) private {
    require(plans[plan].active, 'Inactive plan');
    remainingSchedulings[requestor][plan] += schedulingAmount;
    emit SchedulingsPurchased(requestor, plan, schedulingAmount);
  }

  function purchase(uint256 plan, uint256 amount) external {
    doPurchase(msg.sender, plan, amount);
    require(plans[plan].token.transferFrom(msg.sender, address(this), totalPrice(plan, amount)), "Payment did't pass");
  }

  function tokenFallback(
    address from,
    uint256 amount,
    bytes calldata data
  ) external override returns (bool) {
    uint256 plan;
    uint256 schedulingAmount;
    (plan, schedulingAmount) = abi.decode(data, (uint256, uint256));
    require(address(plans[plan].token) == address(msg.sender), 'Bad token');
    require(amount == totalPrice(plan, schedulingAmount), "Transferred amount doesn't match total purchase");
    doPurchase(from, plan, schedulingAmount);
    return true;
  }

  function getRemainingSchedulings(address requestor, uint256 plan) external view returns (uint256) {
    return remainingSchedulings[requestor][plan];
  }

  function spend(address requestor, uint256 plan) private {
    require(remainingSchedulings[requestor][plan] > 0, 'No balance available');
    remainingSchedulings[requestor][plan] -= 1;
  }

  function refund(uint256 index) private {
    Metatransaction storage metatransaction = transactionsScheduled[index];
    remainingSchedulings[metatransaction.requestor][metatransaction.plan] += 1;
    metatransaction.state = MetatransactionState.Refunded;
    payable(metatransaction.requestor).transfer(metatransaction.value);
  }

  function schedule(
    uint256 plan,
    address to,
    bytes calldata data,
    uint256 gas,
    uint256 executionTime
  ) external payable {
    // slither-disable-next-line timestamp
    require(block.timestamp <= executionTime, 'Cannot schedule it in the past');
    spend(msg.sender, plan);
    transactionsScheduled.push(
      Metatransaction(payable(msg.sender), plan, payable(to), data, gas, executionTime, msg.value, MetatransactionState.Scheduled)
    );
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
      MetatransactionState
    )
  {
    Metatransaction memory metatransaction = transactionsScheduled[index];
    MetatransactionState state = transactionState(index);
    return (
      metatransaction.requestor,
      metatransaction.plan,
      metatransaction.to,
      metatransaction.data,
      metatransaction.gas,
      metatransaction.timestamp,
      metatransaction.value,
      state
    );
  }

  // State transitions for scheduled transaction:
  //   Scheduled -> ExecutionSuccessful
  //   Scheduled -> ExecutionFailed
  //   Scheduled -> Overdue (Scheduled but scheduledTime outside the execution window, expected earlier)
  //   Scheduled -> Refunded (refunds when executed and it's overdue)

  // slither-disable-next-line timestamp
  function transactionState(uint256 index) public view returns (MetatransactionState) {
    Metatransaction memory metatransaction = transactionsScheduled[index];
    if (
      metatransaction.state == MetatransactionState.Scheduled &&
      (metatransaction.timestamp + (plans[metatransaction.plan].window) < block.timestamp)
    ) {
      return MetatransactionState.Overdue;
    } else {
      return metatransaction.state;
    }
  }

  // slither-disable-next-line low-level-calls
  function execute(uint256 index) external nonReentrant {
    Metatransaction storage metatransaction = transactionsScheduled[index];

    require(metatransaction.state == MetatransactionState.Scheduled, 'Already executed');
    // slither-disable-next-line timestamp
    require((metatransaction.timestamp - plans[metatransaction.plan].window) < block.timestamp, 'Too soon');

    if (transactionState(index) == MetatransactionState.Overdue) {
      // - penalize the service provider
      refund(index);
      return;
    }
    // We can use gasleft() here to charge the consumer for the gas
    // A contract may hold user's gas and charge it after executing
    // the transaction
    (bool success, bytes memory result) =
      metatransaction.to.call{ gas: metatransaction.gas, value: metatransaction.value }(metatransaction.data);

    emit MetatransactionExecuted(index, success, result);

    if (success) {
      metatransaction.state = MetatransactionState.ExecutionSuccessful;
    } else {
      metatransaction.state = MetatransactionState.ExecutionFailed;
    }
    // slither-disable-next-line reentrancy-events

    // The difference when calling gasleft() again is (aprox.) the gas used
    // After executing we do the payout to the service provider:
    // - return the gas used
    require(plans[metatransaction.plan].token.transfer(payee, plans[metatransaction.plan].schegulingPrice), "Couldn't transfer to payee");
  }
}
