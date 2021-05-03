const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677') // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const ONE_DAY = 60 * 60 * 24 // in seconds
const { plans, MetaTransactionState } = require('./common.js')

const insideWindow = (window) => window.sub(toBN(1000))
const outsideWindow = (window) => window.add(toBN(1000))

const getMethodSig = (method) => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')
const failData = getMethodSig('fail()')

let initialSnapshot = null
timeMachine.takeSnapshot().then((id) => {
  initialSnapshot = id
})

contract('OneShotSchedule', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts
    await timeMachine.revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    await this.token.transfer(this.requestor, 100000, { from: this.contractAdmin })

    this.oneShotSchedule = await OneShotSchedule.new(this.serviceProvider, this.payee)
    this.counter = await Counter.new()
    this.gas = toBN(await this.counter.inc.estimateGas())

    this.getTxState = (transaction) => this.oneShotSchedule.transactionState(transaction).then((state) => state.toString())

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })

    this.testScheduleWithValue = async (plan, data, value, timestamp) => {
      const to = this.counter.address
      const from = this.requestor
      const gas = this.gas
      await this.token.approve(this.oneShotSchedule.address, plans[plan].price, { from })
      await this.oneShotSchedule.purchase(plan, toBN(1), { from })
      return this.oneShotSchedule.schedule(plan, to, data, gas, timestamp, { from, value })
    }
  })

  describe('execution', async () => {
    beforeEach(async () => {
      this.executeWithTime = async (executionTimestamp) => {
        await time.increaseTo(executionTimestamp)
        await time.advanceBlock()
        return this.oneShotSchedule.execute(0)
      }

      this.testExecutionWithValue = async (value) => {
        const timestamp = await time.latest()
        const insideWindowTime = timestamp.add(insideWindow(plans[0].window))
        await this.testScheduleWithValue(0, incData, value, insideWindowTime)
        await time.increaseTo(insideWindowTime)
        await time.advanceBlock()
        const initialPayeeBalance = await this.token.balanceOf(this.payee)
        const initialContractBalance = await this.token.balanceOf(this.oneShotSchedule.address)
        await this.oneShotSchedule.execute(0)
        // Transaction executed status
        assert.strictEqual(await this.getTxState(0), MetaTransactionState.ExecutionSuccessful, 'Execution failed')
        // Transaction executed on contract
        assert.strictEqual(await this.counter.count().then((r) => r.toString()), '1', 'Counter difference')
        // Value transferred to contract
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then((r) => r.toString()), value.toString(), 'wrong balance')
        // token balance transferred from contract to provider
        const expectedPayeeBalance = initialPayeeBalance.add(plans[0].price)
        const expectedContractBalance = initialContractBalance.sub(plans[0].price)
        assert.strictEqual(
          await this.token.balanceOf(this.payee).then((r) => r.toString()),
          expectedPayeeBalance.toString(),
          'wrong provider balance'
        )
        assert.strictEqual(
          await this.token.balanceOf(this.oneShotSchedule.address).then((r) => r.toString()),
          expectedContractBalance.toString(),
          'wrong contract balance'
        )
      }
    })

    it('executes a listed a metatransaction', () => this.testExecutionWithValue(toBN(0)))
    it('executes a listed a metatransaction with value', () => this.testExecutionWithValue(toBN(1e15)))

    it('cannot execute twice', async () => {
      await this.testExecutionWithValue(toBN(0))
      expectRevert(this.oneShotSchedule.execute(0), 'Already executed')
    })

    it('cannot execute before timestamp - window', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      // execute before window
      expectRevert(this.executeWithTime(timestamp.add(toBN(ONE_DAY).sub(outsideWindow(plans[0].window)))), 'Too soon')
    })

    it('should refund if it executes after timestamp + window', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      const requestorBalance = await web3.eth.getBalance(this.requestor)
      // execute after window
      const receipt = await this.executeWithTime(timestamp.add(toBN(ONE_DAY).add(outsideWindow(plans[0].window))))
      // this should reflect that it was late
      expectEvent.notEmitted(receipt, 'MetatransactionExecuted')
      assert.strictEqual((await web3.eth.getBalance(this.requestor)) - requestorBalance, 0, 'Transaction value not refunded')
      assert.strictEqual(
        (await this.oneShotSchedule.getRemainingSchedulings(this.requestor, toBN(0))).toString(),
        '1',
        'Schedule not refunded'
      )
      assert.strictEqual(await this.getTxState(0), MetaTransactionState.Refunded, 'Execution not failed')
    })

    describe('failing metatransactions', () => {
      it('due to revert in called contract', async () => {
        const timestamp = await time.latest()
        // scheduled for tomorrow
        await this.testScheduleWithValue(0, failData, toBN(0), timestamp.add(toBN(10)))
        const tx = await this.oneShotSchedule.execute(0)
        const log = tx.logs.find((l) => l.event === 'MetatransactionExecuted')
        assert.ok(Buffer.from(log.args.result.slice(2), 'hex').toString('utf-8').includes('Boom'))
        expectEvent(tx, 'MetatransactionExecuted', {
          index: toBN(0),
          success: false,
        })
        assert.strictEqual(await this.getTxState(0), MetaTransactionState.ExecutionFailed, 'Execution did not fail')
      })

      it('due to insufficient gas in called contract', async () => {
        const to = this.counter.address
        const gas = toBN(10)
        const timestamp = await time.latest()
        const from = this.requestor
        const timestampInsideWindow = timestamp.add(insideWindow(plans[0].window))
        await this.token.approve(this.oneShotSchedule.address, plans[0].price, { from })
        await this.oneShotSchedule.purchase(toBN(0), toBN(1), { from })
        await this.oneShotSchedule.schedule(0, to, failData, gas, timestampInsideWindow, { from })
        const receipt = await this.oneShotSchedule.execute(0)
        expectEvent(receipt, 'MetatransactionExecuted', {
          index: toBN(0),
          success: false,
        })
        assert.strictEqual(await this.getTxState(0), MetaTransactionState.ExecutionFailed, 'Execution did not fail')
      })
    })
  })

  describe('transaction states', async () => {
    it('should go from scheduled to Overdue', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const executionTimestamp = timestamp.add(toBN(ONE_DAY).add(outsideWindow(plans[0].window)))
      await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      assert.strictEqual(await this.getTxState(0), MetaTransactionState.Scheduled, 'Not scheduled')
      await time.increaseTo(executionTimestamp)
      await time.advanceBlock()
      assert.strictEqual(await this.getTxState(0), MetaTransactionState.Overdue, 'Not overdue')
    })
  })
})
