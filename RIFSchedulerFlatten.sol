// File: @openzeppelin/contracts/token/ERC20/IERC20.sol

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// File: @rsksmart/erc677/contracts/IERC677.sol

pragma solidity ^0.8.0;


interface IERC677 is IERC20 {
  function transferAndCall(
    address to,
    uint256 value,
    bytes memory data
  ) external returns (bool ok);

  event Transfer(address indexed from, address indexed to, uint256 value, bytes data);
}

// File: @rsksmart/erc677/contracts/IERC677TransferReceiver.sol

pragma solidity ^0.8.0;

/*
 * Contract interface for receivers of tokens that
 * comply with ERC-677.
 * See https://github.com/ethereum/EIPs/issues/677 for details.
 */
interface IERC677TransferReceiver {
  function tokenFallback(
    address from,
    uint256 amount,
    bytes calldata data
  ) external returns (bool);
}

// File: @openzeppelin/contracts/security/ReentrancyGuard.sol


pragma solidity ^0.8.0;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor () {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and make it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }
}

// File: @openzeppelin/contracts/utils/Context.sol


pragma solidity ^0.8.0;

/*
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        return msg.data;
    }
}

// File: @openzeppelin/contracts/security/Pausable.sol


pragma solidity ^0.8.0;


/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor () {
        _paused = false;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// File: contracts/RIFScheduler.sol

pragma solidity ^0.8.0;





contract RIFScheduler is IERC677TransferReceiver, ReentrancyGuard, Pausable {
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

  constructor(address serviceProvider_, address payee_) {
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

  function totalPrice(uint256 plan, uint256 quantity) private view returns (uint256) {
    return quantity * plans[plan].pricePerExecution;
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
      payable(msg.sender).transfer(amountToRefund);
    } else {
      require(plans[plan].token.transfer(msg.sender, amountToRefund), 'Refund failed');
    }
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

  function _schedule(Execution memory execution) private whenNotPaused returns (bytes32 id) {
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
    require(executions[id].state == ExecutionState.Scheduled, 'Transaction not scheduled'); // Checking state directly to consider Scheduled and Overdue
    require(msg.sender == executions[id].requestor, 'Not authorized');

    Execution storage execution = executions[id];
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
  function execute(bytes32 id) external nonReentrant whenNotPaused {
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
