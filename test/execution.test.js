const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const ONE_DAY = 60 * 60 * 24 // in seconds
const { plans, ExecutionState, setupContracts, insideWindow, outsideWindow, getExecutionId, getMethodSig } = require('./common.js')

const incData = getMethodSig({ inputs: [], name: 'inc', type: 'function' })
const failData = getMethodSig({ inputs: [], name: 'fail', type: 'function' })

contract('OneShotSchedule - execution', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule

    this.counter = await Counter.new()

    this.getState = (executionId) => this.oneShotSchedule.getState(executionId).then((state) => state.toString())

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })
    plans[0].token = this.token.address
    await this.oneShotSchedule.addPlan(plans[1].price, plans[1].window, constants.ZERO_ADDRESS, { from: this.serviceProvider })
    plans[1].token = constants.ZERO_ADDRESS

    this.testScheduleWithValue = async (planId, data, value, timestamp, payWithRBTC) => {
      const to = this.counter.address
      const from = this.requestor
      const gas = toBN(await this.counter.inc.estimateGas())
      if (payWithRBTC) {
        await this.oneShotSchedule.purchase(planId, toBN(1), { from, value: plans[planId].price })
      } else {
        await this.token.approve(this.oneShotSchedule.address, plans[planId].price, { from })
        await this.oneShotSchedule.purchase(planId, toBN(1), { from })
      }
      const scheduleReceipt = await this.oneShotSchedule.schedule(planId, to, data, gas, timestamp, { from, value })
      return getExecutionId(scheduleReceipt)
    }

    this.executeWithTime = async (txId, executionTimestamp) => {
      await time.increaseTo(executionTimestamp)
      await time.advanceBlock()
      return this.oneShotSchedule.execute(txId)
    }

    this.testExecutionWithValue = async (value, planId) => {
      const timestamp = await time.latest()
      const insideWindowTime = timestamp.add(insideWindow(planId))
      const plan = plans[planId]
      const payWithRBTC = plan.token === constants.ZERO_ADDRESS
      const getBalance = payWithRBTC ? web3.eth.getBalance : this.token.balanceOf

      const initialPayeeBalance = await getBalance(this.payee)
      const initialContractBalance = await getBalance(this.oneShotSchedule.address)

      const txId = await this.testScheduleWithValue(planId, incData, value, insideWindowTime, payWithRBTC)
      await time.increaseTo(insideWindowTime)
      await time.advanceBlock()

      await this.oneShotSchedule.execute(txId)
      // Transaction executed status
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionSuccessful, 'Execution failed')
      // Transaction executed on contract
      assert.strictEqual(await this.counter.count().then((r) => r.toString()), '1', 'Counter difference')
      // Value transferred to contract
      assert.strictEqual(await web3.eth.getBalance(this.counter.address).then((r) => r.toString()), value.toString(), 'wrong balance')
      // token balance transferred from contract to provider
      const expectedPayeeBalance = toBN(initialPayeeBalance).add(plan.price)
      assert.strictEqual(await getBalance(this.payee).then((r) => r.toString()), expectedPayeeBalance.toString(), 'wrong provider balance')
      assert.strictEqual(
        await getBalance(this.oneShotSchedule.address).then((r) => r.toString()),
        initialContractBalance.toString(),
        'wrong contract balance'
      )
      return txId
    }
  })

  describe('success', () => {
    it('executes a listed a execution', () => this.testExecutionWithValue(toBN(0), 0))
    it('executes a listed a execution rBTC', () => this.testExecutionWithValue(toBN(0), 1))

    it('executes a listed a execution with value', () => this.testExecutionWithValue(toBN(1e15), 0))
    it('executes a listed a execution rBTC with value', () => this.testExecutionWithValue(toBN(1e15), 1))
  })

  describe('failing', () => {
    beforeEach(() => {
      this.refundTest = async (planId) => {
        const timestamp = await time.latest()
        // scheduled for tomorrow
        const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
        const payWithRBTC = plans[planId].token === constants.ZERO_ADDRESS
        const txId = await this.testScheduleWithValue(planId, incData, toBN(10), scheduleTimestamp, payWithRBTC)
        const requestorBalance = await web3.eth.getBalance(this.requestor)
        // execute after window
        const receipt = await this.executeWithTime(txId, timestamp.add(toBN(ONE_DAY).add(outsideWindow(planId))))
        // this should reflect that it was late
        expectEvent.notEmitted(receipt, 'Executed')
        assert.strictEqual((await web3.eth.getBalance(this.requestor)) - requestorBalance, 0, 'Transaction value not refunded')
        assert.strictEqual(
          (await this.oneShotSchedule.remainingExecutions(this.requestor, toBN(planId))).toString(),
          '1',
          'Schedule not refunded'
        )
        assert.strictEqual(await this.getState(txId), ExecutionState.Refunded, 'Execution not failed')
      }
    })
    it('cannot execute twice', async () => {
      const txId = await this.testExecutionWithValue(toBN(0), 0)
      return expectRevert(this.oneShotSchedule.execute(txId), 'Already executed')
    })

    it('cannot execute before timestamp - window', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const txId = await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      // execute before window
      return expectRevert(this.executeWithTime(txId, timestamp.add(toBN(ONE_DAY).sub(outsideWindow(0)))), 'Too soon')
    })

    it('should refund if it executes after timestamp + window', () => this.refundTest(0))

    it('should refund if it executes after timestamp + window - rBTC', () => this.refundTest(1))

    it('should go from scheduled to Overdue when time passes', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const executionTimestamp = timestamp.add(toBN(ONE_DAY).add(outsideWindow(0)))
      const txId = await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      assert.strictEqual(await this.getState(txId), ExecutionState.Scheduled, 'Not scheduled')
      await time.increaseTo(executionTimestamp)
      await time.advanceBlock()
      assert.strictEqual(await this.getState(txId), ExecutionState.Overdue, 'Not overdue')
    })
  })

  describe('failing metatransactions - execution not failing', () => {
    it('due to revert in called contract', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const txId = await this.testScheduleWithValue(0, failData, toBN(0), timestamp.add(toBN(10)))
      const tx = await this.oneShotSchedule.execute(txId)
      const log = tx.logs.find((l) => l.event === 'Executed')
      assert.ok(Buffer.from(log.args.result.slice(2), 'hex').toString('utf-8').includes('Boom'))
      expectEvent(tx, 'Executed', {
        id: txId,
        success: false,
      })
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionFailed, 'Execution did not fail')
    })

    it('due to insufficient gas in called contract', async () => {
      const to = this.counter.address
      const gas = toBN(10)
      const timestamp = await time.latest()
      const from = this.requestor
      const timestampInsideWindow = timestamp.add(insideWindow(0))
      await this.token.approve(this.oneShotSchedule.address, plans[0].price, { from })
      await this.oneShotSchedule.purchase(toBN(0), toBN(1), { from })
      const scheduleReceipt = await this.oneShotSchedule.schedule(0, to, failData, gas, timestampInsideWindow, { from })
      const txId = getExecutionId(scheduleReceipt)
      const receipt = await this.oneShotSchedule.execute(txId)
      expectEvent(receipt, 'Executed', {
        id: txId,
        success: false,
      })
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionFailed, 'Execution did not fail')
    })
  })
})
