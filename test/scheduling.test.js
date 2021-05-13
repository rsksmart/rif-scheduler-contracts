const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectRevert } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils
const { plans, ExecutionState, setupContracts, insideWindow, outsideWindow, getExecutionId, getMethodSig } = require('./common.js')
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent')

const incData = getMethodSig({ inputs: [], name: 'inc', type: 'function' })

contract('OneShotSchedule - scheduling', (accounts) => {
  beforeEach(async () => {
     ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule

    this.counter = await Counter.new()

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })

    this.testScheduleWithValue = async (plan, value, timestamp) => {
      const to = this.counter.address
      const gas = toBN(await this.counter.inc.estimateGas())
      await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.requestor })
      await this.oneShotSchedule.purchase(plan, 1, { from: this.requestor })
      const scheduleReceipt = await this.oneShotSchedule.schedule(plan, to, incData, gas, timestamp, { from: this.requestor, value })
      const executionId = getExecutionId(scheduleReceipt)
      const actual = await this.oneShotSchedule.getSchedule(executionId)
      const scheduled = await this.oneShotSchedule.remainingExecutions(this.requestor, plan)

      assert.strictEqual(actual[0], this.requestor, 'Not scheduled for this user')
      assert.strictEqual(actual[1].toString(), toBN(plan).toString(), 'Wrong plan')
      assert.strictEqual(actual[2], to, 'Wrong contract address')
      assert.strictEqual(actual[3], incData)
      assert.strictEqual(actual[4].toString(), gas.toString())
      assert.strictEqual(actual[5].toString(), timestamp.toString())
      assert.strictEqual(actual[6].toString(), value.toString())
      assert.strictEqual(actual[7].toString(), ExecutionState.Scheduled)

      assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
      return executionId
    }
  })

  it('schedule a new execution', async () => {
    const scheduleTime = (await time.latest()).add(toBN(100))
    return this.testScheduleWithValue(0, toBN(0), scheduleTime)
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
      const scheduling = await this.oneShotSchedule.getSchedule(txId)
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

    it('should fail to cancel a cancelled execution', async () => {
      const txId = await this.scheduleOneValid(toBN(1e15))
      await this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor })
      return expectRevert(this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor }), 'Transaction not scheduled')
    })

    it('should fail to cancel transactions if not the requestor', async () => {
      const txId = await this.scheduleOneValid(toBN(1e15))
      return expectRevert(this.oneShotSchedule.cancelScheduling(txId, { from: this.serviceProvider }), 'Not authorized')
    })

    it('should fail to cancel transactions after execution window', async () => {
      const scheduleTime = (await time.latest()).add(toBN(100))
      const timestampOutsideWindow = scheduleTime.add(outsideWindow(0))
      const txId = await this.testScheduleWithValue(0, toBN(1e15), scheduleTime)
      await time.increaseTo(timestampOutsideWindow)
      await time.advanceBlock()
      return expectRevert(this.oneShotSchedule.cancelScheduling(txId, { from: this.requestor }), 'Transaction not scheduled')
    })
  })
})
