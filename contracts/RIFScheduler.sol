// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/IERC677TransferReceiver.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

contract RIFScheduler is IERC677TransferReceiver, ReentrancyGuard, Pausable {
  enum ExecutionState {
    Nonexistent,
    Scheduled,
    ExecutionSuccessful,
    ExecutionFailed,
    Overdue,
    Refunded,
    Cancelled
  }
  // State transitions for scheduled executions:
  //   Initial state: Nonexistent
  //   Nonexistent -> Scheduled (requestor scheduled execution)
  //   Scheduled -> Cancelled (requestor cancelled execution)
  //   Scheduled -> ExecutionSuccessful (call was executed in the given time and did not fail)
  //   Scheduled -> ExecutionFailed (call was executed in the given time but failed)
  //   Scheduled -> Overdue (execution window has passed, expected earlier)
  //   Overdue -> Refunded (refund for overdue execution paid)

  struct Execution {
    address requestor;
    uint256 plan;
    address to;
    bytes data;
    uint256 gas;
    uint256 timestamp;
    uint256 value;
    ExecutionState state;
  }

  struct Plan {
    uint256 pricePerExecution;
    uint256 window;
    IERC677 token;
    bool active;
  }

  address public serviceProvider;
  address public payee;
  uint256 public minimumTimeBeforeExecution; // minimum time required between the schedule and execution time requested 

  Plan[] public plans;

  mapping(address => mapping(uint256 => uint256)) public remainingExecutions;
  mapping(bytes32 => Execution) private executions;
  mapping(address => bytes32[]) private executionsByRequestor; // redundant with executions, allows requestors to query all their executions wihtout any 2nd layer

  event PlanAdded(uint256 indexed index, uint256 price, address token, uint256 window);
  event PlanRemoved(uint256 indexed index);

  event ExecutionPurchased(address indexed requestor, uint256 plan, uint256 amount);
  event ExecutionRequested(bytes32 indexed id, uint256 timestamp);
  event Executed(bytes32 indexed id, bool success, bytes result);
  event ExecutionCancelled(bytes32 indexed id);

  modifier onlyProvider() {
    require(address(msg.sender) == serviceProvider, 'Not authorized');
    _;
  }

  constructor(address serviceProvider_, address payee_, uint256 minimumTimeBeforeExecution_) {
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    require(serviceProvider_ != address(0x0), 'Service provider address cannot be 0x0');
    require(minimumTimeBeforeExecution_ >= 15, 'Executions should be requested at least 15 seconds in advance');
    serviceProvider = serviceProvider_;
    payee = payee_;
    minimumTimeBeforeExecution = minimumTimeBeforeExecution_;
  }

  ///////////
  // ADMIN //
  ///////////

  function addPlan(
    uint256 price,
    uint256 window,
    IERC677 token
  ) external onlyProvider whenNotPaused {
    plans.push(Plan(price, window, token, true));
    emit PlanAdded(plans.length - 1, price, address(token), window);
  }

  function removePlan(uint256 plan) external onlyProvider {
    require(plans[plan].active, 'The plan is already inactive');
    plans[plan].active = false;
    emit PlanRemoved(plan);
  }

  function plansCount() external view returns (uint256) {
    return plans.length;
  }

  function setPayee(address payee_) external onlyProvider {
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    payee = payee_;
  }

  function pause() external onlyProvider {
    _pause();
  }

  function unpause() external onlyProvider {
    _unpause();
  }

  //////////////
  // PURCHASE //
  //////////////

  /*
   * Plans are paid via plan.token
   * If plan.token is 0, then it is paid via RBTC
   *   Use purchase method and set the total price in the transaction value
   * Otherwhise, if it supports ERC-677 you can use
   *   transferAndCall(
   *     to: this address,
   *     value: total price,
   *     data: (uint256 plan, uint256 quantity) abi encoded)
   * If it supports ERC-20
   *   First, approve this contract with approve(spender: this address, amount: total price)
   *   Then use pruchase method and set tx value to 0
   **/

  function totalPrice(uint256 plan, uint256 quantity) private view returns (uint256) {
    return quantity * plans[plan].pricePerExecution;
  }

  function doPurchase(
    address requestor,
    uint256 plan,
    uint256 amount
  ) private whenNotPaused {
    require(plans[plan].active, 'Inactive plan');
    remainingExecutions[requestor][plan] += amount;
    emit ExecutionPurchased(requestor, plan, amount);
  }

  // purcahse with ERC-20 and rBTC, for rBTC the plan's token address 0x0
  function purchase(uint256 plan, uint256 quantity) external payable {
    if (address(plans[plan].token) != address(0x0)) {
      require(msg.value == 0, 'rBTC not accepted for this plan');
      doPurchase(msg.sender, plan, quantity);
      require(plans[plan].token.transferFrom(msg.sender, address(this), totalPrice(plan, quantity)), "Payment did't pass");
    } else {
      require(msg.value == totalPrice(plan, quantity), "Transferred amount doesn't match total purchase");
      doPurchase(msg.sender, plan, quantity);
    }
  }

  // purcahse with ERC-677
  function tokenFallback(
    address from,
    uint256 amount,
    bytes calldata data
  ) external override returns (bool) {
    (uint256 plan, uint256 quantity) = abi.decode(data, (uint256, uint256));

    require(address(plans[plan].token) == address(msg.sender), 'Bad token');
    require(amount == totalPrice(plan, quantity), "Transferred amount doesn't match total purchase");

    doPurchase(from, plan, quantity);
    return true;
  }

  // If the service provider pauses the contract, it means that is no longer
  // providing the service. In this case, users that have bought any plan can request
  // a refund.
  function requestPlanRefund(uint256 plan) external whenPaused {
    require(remainingExecutions[msg.sender][plan] > 0, 'No balance to refund');
    uint256 amountToRefund = totalPrice(plan, remainingExecutions[msg.sender][plan]);
    remainingExecutions[msg.sender][plan] = 0;
    if (amountToRefund == 0) return;
    if (address(plans[plan].token) == address(0x0)) {
      (bool paymentSuccess, bytes memory result) = payable(msg.sender).call{ value: amountToRefund }('');
      require(paymentSuccess, string(result));
    } else {
      require(plans[plan].token.transfer(msg.sender, amountToRefund), 'Refund failed');
    }
  }

  ////////////////
  // SCHEDULING //
  ////////////////

  function getExecutionId(Execution memory execution) public pure returns (bytes32) {
    return
      keccak256(
        abi.encode(execution.requestor, execution.plan, execution.to, execution.data, execution.gas, execution.timestamp, execution.value)
      );
  }

  function _schedule(
    uint256 plan,
    address to,
    bytes memory data,
    uint256 gas,
    uint256 timestamp,
    uint256 value
  ) private whenNotPaused returns (bytes32 id) {
    Execution memory execution = Execution(msg.sender, plan, to, data, gas, timestamp, value, ExecutionState.Scheduled);
    id = getExecutionId(execution);

    require(getState(id) == ExecutionState.Nonexistent, 'Already scheduled');
    require(remainingExecutions[msg.sender][execution.plan] > 0, 'No balance available');
    // see notice bellow, about disabled checks
    // slither-disable-next-line timestamp
    require(block.timestamp + minimumTimeBeforeExecution <= execution.timestamp, 'Cannot schedule it in the past');

    remainingExecutions[msg.sender][execution.plan] -= 1;
    executions[id] = execution;
    executionsByRequestor[msg.sender].push(id);
    emit ExecutionRequested(id, execution.timestamp);
  }

  function schedule(
    uint256 plan,
    address to,
    bytes calldata data,
    uint256 gas,
    uint256 timestamp
  ) external payable returns (bytes32 id) {
    return (_schedule(plan, to, data, gas, timestamp, msg.value));
  }

  function batchSchedule(bytes[] calldata data) external payable returns (bytes32[] memory ids) {
    uint256 totalValue;
    ids = new bytes32[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
      (uint256 plan, address to, bytes memory txData, uint256 gas, uint256 timestamp, uint256 value) = abi.decode(
        data[i],
        (uint256, address, bytes, uint256, uint256, uint256)
      );
      totalValue += value;
      ids[i] = _schedule(plan, to, txData, gas, timestamp, value);
    }
    require(totalValue == msg.value, "Executions total value doesn't match");
  }

  //////////////
  // QUERYING //
  //////////////

  // slither-disable-next-line timestamp
  function getState(bytes32 id) public view returns (ExecutionState) {
    Execution memory execution = executions[id];
    if (execution.state == ExecutionState.Scheduled && ((execution.timestamp + plans[execution.plan].window) < block.timestamp)) {
      return ExecutionState.Overdue;
    } else {
      return execution.state;
    }
  }

  function getExecutionById(bytes32 id) public view returns (Execution memory execution) {
    execution = executions[id];
    execution.state = getState(id);
  }

  function executionsByRequestorCount(address requestor) external view returns (uint256) {
    return executionsByRequestor[requestor].length;
  }

  function getExecutionsByRequestor(
    address requestor,
    uint256 fromIndex,
    uint256 toIndex
  ) external view returns (Execution[] memory executionList) {
    require(executionsByRequestor[requestor].length >= toIndex && fromIndex < toIndex, 'Out of range');
    executionList = new Execution[](toIndex - fromIndex);
    for (uint256 i = fromIndex; i < toIndex; i++) {
      executionList[i - fromIndex] = getExecutionById(executionsByRequestor[requestor][i]);
    }
  }

  ////////////////
  // CANCELLING //
  ////////////////

  function cancelScheduling(bytes32 id) external {
    require(executions[id].state == ExecutionState.Scheduled, 'Transaction not scheduled'); // Checking state directly to consider Scheduled and Overdue
    require(msg.sender == executions[id].requestor, 'Not authorized');

    Execution storage execution = executions[id];
    execution.state = ExecutionState.Cancelled;
    remainingExecutions[execution.requestor][execution.plan] += 1;
    emit ExecutionCancelled(id);
    (bool paymentSuccess, bytes memory paymentResult) = payable(execution.requestor).call{ value: execution.value }('');
    require(paymentSuccess, string(paymentResult));
  }

  ///////////////
  // EXECUTION //
  ///////////////

  // Notice about security and omitted checks:
  // low-level-calls: the contract will execute call wether the contract has code or not. It is
  //   responsability of the requestor to choose the correct contract address.
  // timestamp: timestamp manipulation should be considered in the window and the minimumTimeBeforeExecution set by the service provider

  function refund(bytes32 id) private {
    Execution storage execution = executions[id];
    remainingExecutions[execution.requestor][execution.plan] += 1;
    execution.state = ExecutionState.Refunded;
    payable(execution.requestor).transfer(execution.value);
  }

  // This method can be executed by any account. It will execute the shceduled transaction
  // only if the current time is in [timestamp - window, timestamp + window], and after execution
  // will pay the service provider and ensure payment is received.
  function execute(bytes32 id) external nonReentrant whenNotPaused {
    Execution storage execution = executions[id];

    require(execution.state == ExecutionState.Scheduled, 'Already executed');
    require((execution.timestamp - plans[execution.plan].window) < block.timestamp, 'Too soon');

    if (getState(id) == ExecutionState.Overdue) {
      refund(id);
      return;
    }

    (bool success, bytes memory result) = payable(execution.to).call{ gas: execution.gas, value: execution.value }(execution.data);

    emit Executed(id, success, result);

    if (success) {
      execution.state = ExecutionState.ExecutionSuccessful;
    } else {
      execution.state = ExecutionState.ExecutionFailed;
    }

    if (address(plans[execution.plan].token) != address(0x0)) {
      require(plans[execution.plan].token.transfer(payee, plans[execution.plan].pricePerExecution), "Couldn't transfer to payee");
    } else {
      (bool paymentSuccess, bytes memory paymentResult) = payable(payee).call{ value: plans[execution.plan].pricePerExecution }('');
      require(paymentSuccess, string(paymentResult));
    }
  }

  function multicall(bytes[] calldata data) external whenNotPaused returns (bytes[] memory results) {
    results = new bytes[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
      (bool success, bytes memory result) = address(this).delegatecall(data[i]);
      require(success);
      results[i] = result;
    }
    return results;
  }
}
