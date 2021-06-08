// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/IERC677TransferReceiver.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

contract OneShotSchedule is IERC677TransferReceiver, Initializable, ReentrancyGuardUpgradeable {
  enum ExecutionState { Nonexistent, Scheduled, ExecutionSuccessful, ExecutionFailed, Overdue, Refunded, Cancelled }
  // State transitions for scheduled executions:
  //   Nonexistent -> Scheduled (requestor scheduled execution, 'Nonexistent' state is never assigned)
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

  Plan[] public plans;

  mapping(address => mapping(uint256 => uint256)) public remainingExecutions;
  mapping(bytes32 => Execution) private executions;
  mapping(address => bytes32[]) private executionsByRequestor; // redundant with executions

  address private immutable self = address(this);

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

  function initialize(address serviceProvider_, address payee_) external initializer {
    __ReentrancyGuard_init();
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    require(serviceProvider_ != address(0x0), 'Service provider address cannot be 0x0');
    serviceProvider = serviceProvider_;
    payee = payee_;
  }

  ///////////
  // ADMIN //
  ///////////

  function addPlan(
    uint256 price,
    uint256 window,
    IERC677 token
  ) external onlyProvider {
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

  //////////////
  // PURCHASE //
  //////////////

  function totalPrice(uint256 plan, uint256 quantity) private view returns (uint256) {
    return quantity * plans[plan].pricePerExecution;
  }

  function doPurchase(
    address requestor,
    uint256 plan,
    uint256 amount
  ) private {
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

  ////////////////
  // SCHEDULING //
  ////////////////

  // slither-disable-next-line timestamp
  function getState(bytes32 id) public view returns (ExecutionState) {
    Execution memory execution = executions[id];
    if (execution.state == ExecutionState.Scheduled && ((execution.timestamp + plans[execution.plan].window) < block.timestamp)) {
      return ExecutionState.Overdue;
    } else {
      return execution.state;
    }
  }

  function hash(Execution memory execution) public pure returns (bytes32) {
    return
      keccak256(
        abi.encode(execution.requestor, execution.plan, execution.to, execution.data, execution.gas, execution.timestamp, execution.value)
      );
  }

  function _schedule(Execution memory execution) private returns (bytes32 id) {
    require(msg.sender == execution.requestor, 'Not the requestor'); // just in case
    require(remainingExecutions[msg.sender][execution.plan] > 0, 'No balance available');
    // This is only to prevent errors, doesn't need to be exact
    // timestamp manipulation should be considered in the window by the service provider
    // slither-disable-next-line timestamp
    require(block.timestamp <= execution.timestamp, 'Cannot schedule it in the past');
    id = hash(execution);
    // checking existence, no execution can be scheduled with timestamp 0
    require(executions[id].timestamp == 0, 'Already scheduled');
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
    Execution memory execution = Execution(msg.sender, plan, to, data, gas, timestamp, msg.value, ExecutionState.Scheduled);
    return (_schedule(execution));
  }

  function batchSchedule(bytes[] calldata data) external payable returns (bytes32[] memory ids) {
    uint256 totalValue;
    ids = new bytes32[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
      (uint256 plan, address to, bytes memory txData, uint256 gas, uint256 timestamp, uint256 value) =
        abi.decode(data[i], (uint256, address, bytes, uint256, uint256, uint256));
      totalValue += value;
      ids[i] = _schedule(Execution(msg.sender, plan, to, txData, gas, timestamp, value, ExecutionState.Scheduled));
    }
    require(totalValue == msg.value, "Executions total value doesn't match");
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

  function cancelScheduling(bytes32 id) external {
    Execution storage execution = executions[id];

    require(getState(id) == ExecutionState.Scheduled, 'Transaction not scheduled');
    require(msg.sender == execution.requestor, 'Not authorized');

    execution.state = ExecutionState.Cancelled;
    remainingExecutions[execution.requestor][execution.plan] += 1;
    emit ExecutionCancelled(id);
    payable(execution.requestor).transfer(execution.value);
  }

  ///////////////
  // EXECUTION //
  ///////////////
  function refund(bytes32 id) private {
    Execution storage execution = executions[id];
    remainingExecutions[execution.requestor][execution.plan] += 1;
    execution.state = ExecutionState.Refunded;
    payable(execution.requestor).transfer(execution.value);
  }

  // The nonReentrant prevents this contract to be call again when the low level call is executed
  // timestamp manipulation should be considered in the window by the service provider
  // slither-disable-next-line timestamp
  function execute(bytes32 id) external nonReentrant {
    Execution storage execution = executions[id];

    require(execution.state == ExecutionState.Scheduled, 'Already executed');
    // timestamp manipulation should be considered in the window by the service provider
    // slither-disable-next-line timestamp
    require((execution.timestamp - plans[execution.plan].window) < block.timestamp, 'Too soon');

    if (getState(id) == ExecutionState.Overdue) {
      refund(id);
      return;
    }

    // The contract makes an external call to execute the scheduled transaction on the specified contract.
    // It needs to get the execution result before emitting the event and changing the matatransaction state.
    // slither-disable-next-line low-level-calls
    (bool success, bytes memory result) = payable(execution.to).call{ gas: execution.gas, value: execution.value }(execution.data);

    // reentrancy prevented by nonReentrant modifier
    // slither-disable-next-line reentrancy-events
    emit Executed(id, success, result);

    if (success) {
      // reentrancy prevented by nonReentrant modifier
      // slither-disable-next-line reentrancy-eth
      execution.state = ExecutionState.ExecutionSuccessful;
    } else {
      // reentrancy prevented by nonReentrant modifier
      // slither-disable-next-line reentrancy-eth
      execution.state = ExecutionState.ExecutionFailed;
    }

    if (address(plans[execution.plan].token) != address(0x0)) {
      require(plans[execution.plan].token.transfer(payee, plans[execution.plan].pricePerExecution), "Couldn't transfer to payee");
    } else {
      payable(payee).transfer(plans[execution.plan].pricePerExecution);
    }
  }

  function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
    require(address(this) != self); //This makes safe the use of delegatedcall, making it only viable on the proxy
    results = new bytes[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
      (bool success, bytes memory result) = address(this).delegatecall(data[i]);
      require(success);
      results[i] = result;
    }
    return results;
  }
}
