// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@rsksmart/erc677/contracts/IERC677.sol';
import '@rsksmart/erc677/contracts/IERC677TransferReceiver.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract OneShotSchedule is IERC677TransferReceiver, Initializable {
  enum MetatransactionState { Scheduled, ExecutionSuccessful, ExecutionFailed, Overdue, Refunded, Cancelled }

  struct Metatransaction {
    address requestor;
    uint256 plan;
    address to;
    bytes data;
    uint256 gas;
    uint256 timestamp;
    uint256 value;
    MetatransactionState state;
  }

  struct Plan {
    uint256 schegulingPrice;
    uint256 window;
    IERC677 token;
    bool active;
  }

  address public payee;
  address serviceProvider;
  Plan[] plans;
  mapping(bytes32 => Metatransaction) private transactionsScheduled;
  mapping(address => mapping(uint256 => uint256)) remainingSchedulings;

  event PlanAdded(uint256 indexed index, uint256 price, address token, uint256 window);
  event PlanCancelled(uint256 indexed index);
  event SchedulingsPurchased(address indexed requestor, uint256 plan, uint256 amount);
  event MetatransactionAdded(
    bytes32 indexed id,
    address indexed requestor,
    uint256 indexed plan,
    address to,
    bytes data,
    uint256 gas,
    uint256 timestamp,
    uint256 value
  );
  event MetatransactionExecuted(bytes32 indexed id, bool success, bytes result);
  event MetatransactionCancelled(bytes32 indexed id);

  /////////// Reentrancy check /////
  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;
  uint256 private _status;

  modifier nonReentrant() {
    // On the first call to nonReentrant, _notEntered will be true
    require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
  }
  ///////////

  modifier onlyProvider() {
    require(address(msg.sender) == serviceProvider, 'Not authorized');
    _;
  }

  function initialize(address serviceProvider_, address payee_) public initializer {
    require(payee_ != address(0x0), 'Payee address cannot be 0x0');
    require(serviceProvider_ != address(0x0), 'Service provider address cannot be 0x0');
    serviceProvider = serviceProvider_;
    payee = payee_;
    _status = _NOT_ENTERED;
  }

  ///////////
  // ADMIN //
  ///////////

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

  //////////////
  // PURCHASE //
  //////////////

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

  // purcahse with ERC-20
  function purchase(uint256 plan, uint256 amount) external {
    doPurchase(msg.sender, plan, amount);

    require(plans[plan].token.transferFrom(msg.sender, address(this), totalPrice(plan, amount)), "Payment did't pass");
  }

  // purcahse with ERC-677
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

  ////////////////
  // SCHEDULING //
  ////////////////

  function hash(Metatransaction memory metaTx) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(metaTx.requestor, metaTx.plan, metaTx.to, metaTx.data, metaTx.gas, metaTx.timestamp, metaTx.value, metaTx.state)
      );
  }

  function getRemainingSchedulings(address requestor, uint256 plan) external view returns (uint256) {
    return remainingSchedulings[requestor][plan];
  }

  function spend(address requestor, uint256 plan) private {
    require(remainingSchedulings[requestor][plan] > 0, 'No balance available');
    remainingSchedulings[requestor][plan] -= 1;
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
    Metatransaction memory newMetaTx =
      Metatransaction(msg.sender, plan, to, data, gas, executionTime, msg.value, MetatransactionState.Scheduled);
    bytes32 metatransactionId = hash(newMetaTx);
    transactionsScheduled[metatransactionId] = newMetaTx;
    emit MetatransactionAdded(metatransactionId, msg.sender, plan, to, data, gas, executionTime, msg.value);
  }

  function getSchedule(bytes32 id)
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
    Metatransaction memory metatransaction = transactionsScheduled[id];
    MetatransactionState state = transactionState(id);
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

  function cancelScheduling(bytes32 id) external {
    Metatransaction storage metatransaction = transactionsScheduled[id];
    require(transactionState(id) == MetatransactionState.Scheduled, 'Transaction not scheduled');
    require(msg.sender == metatransaction.requestor, 'Not authorized');

    metatransaction.state = MetatransactionState.Cancelled;
    remainingSchedulings[metatransaction.requestor][metatransaction.plan] += 1;
    emit MetatransactionCancelled(id);
    payable(metatransaction.requestor).transfer(metatransaction.value);
  }

  ///////////////
  // EXECUTION //
  ///////////////

  // State transitions for scheduled transaction:
  //   Scheduled -> ExecutionSuccessful (call was executed in the given time and did not fail)
  //   Scheduled -> ExecutionFailed (call was executed in the given time but failed)
  //   Scheduled -> Overdue (Scheduled but scheduledTime outside the execution window, expected earlier)
  //   Scheduled -> Refunded (refunds when executed and it's overdue)

  // slither-disable-next-line timestamp
  function transactionState(bytes32 id) public view returns (MetatransactionState) {
    Metatransaction memory metatransaction = transactionsScheduled[id];
    if (
      metatransaction.state == MetatransactionState.Scheduled &&
      ((metatransaction.timestamp + plans[metatransaction.plan].window) < block.timestamp)
    ) {
      return MetatransactionState.Overdue;
    } else {
      return metatransaction.state;
    }
  }

  function refund(bytes32 id) private {
    Metatransaction storage metatransaction = transactionsScheduled[id];
    remainingSchedulings[metatransaction.requestor][metatransaction.plan] += 1;
    metatransaction.state = MetatransactionState.Refunded;
    payable(metatransaction.requestor).transfer(metatransaction.value);
  }

  function execute(bytes32 id) external nonReentrant {
    Metatransaction storage metatransaction = transactionsScheduled[id];

    require(metatransaction.state == MetatransactionState.Scheduled, 'Already executed');
    // slither-disable-next-line timestamp
    require((metatransaction.timestamp - plans[metatransaction.plan].window) < block.timestamp, 'Too soon');

    if (transactionState(id) == MetatransactionState.Overdue) {
      refund(id);
      return;
    }
    // slither-disable-next-line low-level-calls
    (bool success, bytes memory result) =
      payable(metatransaction.to).call{ gas: metatransaction.gas, value: metatransaction.value }(metatransaction.data);

    // slither-disable-next-line reentrancy-events
    emit MetatransactionExecuted(id, success, result);

    if (success) {
      // slither-disable-next-line reentrancy-eth
      metatransaction.state = MetatransactionState.ExecutionSuccessful;
    } else {
      // slither-disable-next-line reentrancy-eth
      metatransaction.state = MetatransactionState.ExecutionFailed;
    }

    require(plans[metatransaction.plan].token.transfer(payee, plans[metatransaction.plan].schegulingPrice), "Couldn't transfer to payee");
  }
}
