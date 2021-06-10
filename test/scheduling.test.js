const Counter = artifacts.require('Counter')
const assert = require('assert')
const { time, expectRevert } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils
const {
  plans,
  ExecutionState,
  setupContracts,
  outsideWindow,
  getExecutionId,
  getMultipleExecutionId,
  getMethodSig,
} = require('./common.js')
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent')

const incData = getMethodSig({ inputs: [], name: 'inc', type: 'function' })

contract('OneShotSchedule - scheduling', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule
    await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.requestor })

    this.counter = await Counter.new()
    this.gas = toBN(await this.counter.inc.estimateGas())

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })

    this.testScheduleWithValue = async (plan, value, timestamp) => {
      const to = this.counter.address
      await this.oneShotSchedule.purchase(plan, 1, { from: this.requestor })
      const scheduleReceipt = await this.oneShotSchedule.schedule(plan, to, incData, this.gas, timestamp, { from: this.requestor, value })
      const executionId = getExecutionId(scheduleReceipt)
      const actual = await this.oneShotSchedule.getExecutionById(executionId)
      const scheduled = await this.oneShotSchedule.remainingExecutions(this.requestor, plan)

      assert.strictEqual(actual[0], this.requestor, 'Not scheduled for this user')
      assert.strictEqual(actual[1].toString(), toBN(plan).toString(), 'Wrong plan')
      assert.strictEqual(actual[2], to, 'Wrong contract address')
      assert.strictEqual(actual[3], incData)
      assert.strictEqual(actual[4].toString(), this.gas.toString())
      assert.strictEqual(actual[5].toString(), timestamp.toString())
      assert.strictEqual(actual[6].toString(), value.toString())
      assert.strictEqual(actual[7].toString(), ExecutionState.Scheduled)

      assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
      return executionId
    }
  })

  it('should return Nonexistent state for a not scheduled execution', async () => {
    const txState = await this.oneShotSchedule.getState('0x68a2d4f6db1ab0ae441c0918ce5bbc0b8e30243fed88cd429e4b97f126c3f868', {
      from: this.requestor,
    })
    assert.strictEqual(txState.toString(), ExecutionState.Nonexistent, 'Wrong status')
  })

  it('schedule a new execution', async () => {
    const scheduleTime = (await time.latest()).add(toBN(100))
    return this.testScheduleWithValue(0, toBN(0), scheduleTime)
  })

  it('schedule a new execution even if the plan was cancelled', async () => {
    const timestamp = (await time.latest()).add(toBN(100))
    const plan = 0
    const value = toBN(0)
    await this.oneShotSchedule.purchase(plan, 2, { from: this.requestor })
    assert.strictEqual((await this.oneShotSchedule.remainingExecutions(this.requestor, plan)).toString(), '2', `Wrong initial balance`)
    assert.strictEqual(
      (await this.oneShotSchedule.remainingExecutions(this.requestor, plan)).toString(),
      '2',
      `Wrong initial balance after plan cancellation`
    )
    const scheduleReceipt1 = await this.oneShotSchedule.schedule(plan, this.counter.address, incData, this.gas, timestamp, {
      from: this.requestor,
      value,
    })
    const executionId1 = getExecutionId(scheduleReceipt1)
    assert.strictEqual(
      (await this.oneShotSchedule.remainingExecutions(this.requestor, plan)).toString(),
      '1',
      `Wrong balance - scheduled 1st`
    )
    await this.oneShotSchedule.removePlan(0, { from: this.serviceProvider })
    const scheduleReceipt2 = await this.oneShotSchedule.schedule(plan, this.counter.address, incData, this.gas, timestamp.add(toBN(100)), {
      from: this.requestor,
      value,
    })
    assert.strictEqual(
      (await this.oneShotSchedule.remainingExecutions(this.requestor, plan)).toString(),
      '0',
      `Wrong balance - scheduled 2nd`
    )
    const executionId2 = getExecutionId(scheduleReceipt2)
    const actual1 = await this.oneShotSchedule.getExecutionById(executionId1)
    const actual2 = await this.oneShotSchedule.getExecutionById(executionId2)
    assert.strictEqual(actual1[7].toString(), ExecutionState.Scheduled)
    assert.strictEqual(actual2[7].toString(), ExecutionState.Scheduled)
  })

  it('schedule a new execution with value', async () => {
    const scheduleTime = (await time.latest()).add(toBN(100))
    return this.testScheduleWithValue(0, toBN(1e15), scheduleTime)
  })

  it('cannot schedule in the past', async () => {
    const scheduleTime = (await time.latest()).sub(toBN(1000))
    return expectRevert(this.testScheduleWithValue(0, toBN(1e15), scheduleTime), 'Cannot schedule it in the past')
  })

  it('cannot schedule if requestor has no balance', async () => {
    const scheduleTime = (await time.latest()).add(toBN(100))
    // buy one, use one
    await this.testScheduleWithValue(0, toBN(0), scheduleTime)
    // try to schedule another
    return expectRevert(
      this.oneShotSchedule.schedule(0, this.counter.address, incData, toBN(await this.counter.inc.estimateGas()), scheduleTime, {
        from: this.requestor,
        value: toBN(0),
      }),
      'No balance available'
    )
  })
  it('cannot schedule if already scheduled', async () => {
    const scheduleTime = (await time.latest()).add(toBN(100))
    // buy one, use one
    await this.testScheduleWithValue(0, toBN(0), scheduleTime)
    // try to schedule another
    return expectRevert(this.testScheduleWithValue(0, toBN(0), scheduleTime), 'Already scheduled')
  })

  describe('Scheduling cancellation', () => {
    beforeEach(() => {
      this.scheduleOneValid = async (value) => {
        const timestamp = await time.latest()
        const scheduleTime = timestamp.add(outsideWindow(0))
        return this.testScheduleWithValue(0, value, scheduleTime)
      }
    })

    it('should schedule, cancel execution and refund', async () => {
      const valueForTx = toBN(1e15)
      const txId = await this.scheduleOneValid(valueForTx)
      const requestorBalanceAfterSchedule = toBN(await web3.eth.getBalance(this.requestor))
      const cancelTx = await this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor })

      expectEvent(cancelTx, 'ExecutionCancelled', { id: txId })

      //State should be Cancelled
      const scheduling = await this.oneShotSchedule.getExecutionById(txId)
      assert.strictEqual(scheduling[7].toString(), ExecutionState.Cancelled, 'Not cancelled')

      //Scheduling should be refunded
      assert.strictEqual((await this.oneShotSchedule.remainingExecutions(this.requestor, toBN(0))).toString(), '1', 'Schedule not refunded')

      //Value should be returned from contract to requestor
      //Final contract balance should be 0
      const contractBalanceFinal = await web3.eth.getBalance(this.oneShotSchedule.address)
      assert.strictEqual(contractBalanceFinal.toString(), '0', 'Contract still has value')

      //Final requestor balance should be the same as before scheduling minus used gas
      const tx = await web3.eth.getTransaction(cancelTx.tx)
      const cancelTxCost = toBN(cancelTx.receipt.gasUsed * tx.gasPrice)
      const expectedRequestorBalance = requestorBalanceAfterSchedule.add(valueForTx).sub(cancelTxCost)
      const finalRequestorBalance = toBN(await web3.eth.getBalance(this.requestor))
      assert.strictEqual(expectedRequestorBalance.toString(), finalRequestorBalance.toString(), 'Transaction value not refunded')
    })

    it('should schedule, cancel execution and refund after execution window', async () => {
      const scheduleTime = (await time.latest()).add(toBN(100))
      const timestampOutsideWindow = scheduleTime.add(outsideWindow(0))
      const txId = await this.testScheduleWithValue(0, toBN(1e15), scheduleTime)
      await time.increaseTo(timestampOutsideWindow)
      await time.advanceBlock()
      const cancelTx = await this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor })
      expectEvent(cancelTx, 'ExecutionCancelled', { id: txId })
    })

    it('should fail to cancel a cancelled execution', async () => {
      const txId = await this.scheduleOneValid(toBN(1e15))
      await this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor })
      return expectRevert(this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor }), 'Transaction not scheduled')
    })

    it('should fail to cancel transactions if not the requestor', async () => {
      const txId = await this.scheduleOneValid(toBN(1e15))
      return expectRevert(this.oneShotSchedule.cancelScheduling(txId, { from: this.serviceProvider }), 'Not authorized')
    })
  })

  describe('Schedule multiple transactions', () => {
    beforeEach(() => {
      this.purchaseMany = async (plan, q) => {
        const price = plans[plan].price
        await this.token.approve(this.oneShotSchedule.address, price.mul(toBN(q)), { from: this.requestor })
        await this.oneShotSchedule.purchase(plan, q, { from: this.requestor })
      }

      this.encodeOneExecution = (execution) => {
        return web3.eth.abi.encodeParameters(
          ['uint256', 'address', 'bytes', 'uint256', 'uint256', 'uint256'],
          [execution.plan, execution.to, execution.data, execution.gas, execution.timestamp, execution.value]
        )
      }

      this.encodeExecutions = (executionsArr) => {
        return executionsArr.map((execution) => this.encodeOneExecution(execution))
      }

      this.getSampleExecutions = async (plan, quantity) => {
        const result = []
        const to = this.counter.address
        const gas = toBN(await this.counter.inc.estimateGas())
        const timestampIncrement = toBN(100)
        const timestamp = (await time.latest()).add(toBN(100))
        const value = toBN(plans[plan].price)
        const sampleExecution = { plan, to, data: incData, gas, timestamp, value }
        for (let i = 0; i < quantity; i++) {
          result.push({ ...sampleExecution, timestamp: timestamp.add(timestampIncrement.mul(toBN(i))) })
        }
        return result
      }
    })

    it('should schedule 5 executions', async () => {
      // Tested one by one
      const quantity = 5
      const planId = 0
      const totalValue = toBN(quantity).mul(plans[planId].price)
      await this.purchaseMany(planId, quantity)
      const executions = await this.getSampleExecutions(planId, quantity)
      const encodedExecutions = this.encodeExecutions(executions)
      const scheduleReceipt = await this.oneShotSchedule.batchSchedule(encodedExecutions, { from: this.requestor, value: totalValue })
      const executionsLeft = await this.oneShotSchedule.remainingExecutions(this.requestor, planId)

      const ids = getMultipleExecutionId(scheduleReceipt)

      for (let i = 0; i < quantity; i++) {
        const scheduledExecution = await this.oneShotSchedule.getExecutionById(ids[i])
        const requestedExecution = executions[i]
        assert.strictEqual(scheduledExecution[0], this.requestor, 'Not scheduled for this user')
        assert.strictEqual(scheduledExecution.plan.toString(), requestedExecution.plan.toString(), 'Wrong plan')
        assert.strictEqual(scheduledExecution.to, requestedExecution.to, 'Wrong contract address')
        assert.strictEqual(scheduledExecution.data, requestedExecution.data)
        assert.strictEqual(scheduledExecution.gas.toString(), requestedExecution.gas.toString())
        assert.strictEqual(scheduledExecution.timestamp.toString(), requestedExecution.timestamp.toString())
        assert.strictEqual(scheduledExecution.value.toString(), requestedExecution.value.toString())
        assert.strictEqual(scheduledExecution.state.toString(), ExecutionState.Scheduled)
      }
      expectEvent(scheduleReceipt, 'ExecutionRequested')
      assert.strictEqual(executionsLeft.toString(), '0')
    })

    it('should schedule 5 executions and get all', async () => {
      // Tested with getExecutionsByRequestor
      const quantity = 5
      const planId = 0
      const totalValue = toBN(quantity).mul(plans[planId].price)
      await this.purchaseMany(planId, quantity)
      const executions = await this.getSampleExecutions(planId, quantity)
      const encodedExecutions = this.encodeExecutions(executions)
      const scheduleReceipt = await this.oneShotSchedule.batchSchedule(encodedExecutions, { from: this.requestor, value: totalValue })
      const executionsByRequestor = await this.oneShotSchedule.executionsByRequestorCount(this.requestor)
      const executionList = await this.oneShotSchedule.getExecutionsByRequestor(this.requestor, toBN(0), toBN(quantity))

      for (let i = 0; i < quantity; i++) {
        const scheduledExecution = executionList[i]
        const requestedExecution = executions[i]
        assert.strictEqual(scheduledExecution[0], this.requestor, 'Not scheduled for this user')
        assert.strictEqual(scheduledExecution.plan.toString(), requestedExecution.plan.toString(), 'Wrong plan')
        assert.strictEqual(scheduledExecution.to, requestedExecution.to, 'Wrong contract address')
        assert.strictEqual(scheduledExecution.data, requestedExecution.data)
        assert.strictEqual(scheduledExecution.gas.toString(), requestedExecution.gas.toString())
        assert.strictEqual(scheduledExecution.timestamp.toString(), requestedExecution.timestamp.toString())
        assert.strictEqual(scheduledExecution.value.toString(), requestedExecution.value.toString())
        assert.strictEqual(scheduledExecution.state.toString(), ExecutionState.Scheduled)
      }
      expectEvent(scheduleReceipt, 'ExecutionRequested')
      assert.strictEqual(executionsByRequestor.toString(), quantity.toString())
    })

    it('should fail because of the value', async () => {
      const quantity = 5
      const planId = 0
      const wrongValue = toBN(3)
      await this.purchaseMany(planId, quantity)
      const executions = await this.getSampleExecutions(planId, quantity)
      const encodedExecutions = this.encodeExecutions(executions)
      const scheduleReceipt = this.oneShotSchedule.batchSchedule(encodedExecutions, { from: this.requestor, value: wrongValue })
      return expectRevert(scheduleReceipt, "Executions total value doesn't match")
    })
  })
})
