const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677') // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const { plans } = require('./common.js')

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
    [this.contractAdmin, this.serviceProviderAccount, this.schedulingRequestor] = accounts
    await timeMachine.revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    await this.token.transfer(this.schedulingRequestor, 100000, { from: this.contractAdmin })

    this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProviderAccount)
    this.counter = await Counter.new()
    this.gas = toBN(await this.counter.inc.estimateGas())
  })

  describe('execution', async () => {
    beforeEach(async () => {
      await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, { from: this.serviceProviderAccount })
      this.testScheduleWithValue = async (plan, data, value, timestamp) => {
        const to = this.counter.address
        const from = this.schedulingRequestor
        const gas = this.gas
        await this.token.approve(this.oneShotSchedule.address, plans[plan].price, { from })
        await this.oneShotSchedule.purchase(plan, toBN(1), { from })
        return await this.oneShotSchedule.schedule(plan, to, data, gas, timestamp, { from, value })
      }

      this.addAndExecuteWithTimes = async (data, value, scheduleTimestamp, executionTimestamp) => {
        await this.testScheduleWithValue(0, data, value, scheduleTimestamp)
        await time.increaseTo(executionTimestamp)
        await time.advanceBlock()
        return await this.oneShotSchedule.execute(0)
      }

      this.testExecutionWithValue = async (value) => {
        await time.advanceBlock()
        const timestamp = await time.latest()
        const insideWindowTime = timestamp.add(insideWindow(plans[0].window))
        await this.addAndExecuteWithTimes(incData, value, insideWindowTime, insideWindowTime) //near future inside the window

        assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[7]), 'Not ok')
        assert.strictEqual(await this.counter.count().then((r) => r.toString()), '1', 'Counter difference')
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then((r) => r.toString()), value.toString(), 'wrong balance')
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
      expectRevert(
        this.addAndExecuteWithTimes(
          incData,
          toBN(0),
          timestamp.add(toBN(60 * 60 * 24)), // scheduled for tomorrow
          timestamp.add(toBN(60 * 60 * 24).sub(outsideWindow(plans[0].window)))
        ),
        'Too soon'
      )
    })

    it('cannot execute after timestamp + window', async () => {
      const timestamp = await time.latest()
      expectRevert(
        this.addAndExecuteWithTimes(
          incData,
          toBN(0),
          timestamp.add(toBN(60 * 60 * 24)), // scheduled for tomorrow
          timestamp.add(toBN(60 * 60 * 24).add(outsideWindow(plans[0].window)))
        ),
        'Too late'
      )
    })

    describe('failing metatransactions', () => {
      it('due to revert in called contract', async () => {
        const timestamp = await time.latest()
        const tx = await this.addAndExecuteWithTimes(
          failData,
          toBN(0),
          timestamp.add(toBN(60 * 60 * 24)), // scheduled for tomorrow
          timestamp.add(toBN(60 * 60 * 24).add(insideWindow(plans[0].window)))
        )
        const log = tx.logs.find((l) => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(Buffer.from(log.args.result.slice(2), 'hex').toString('utf-8').includes('Boom'))
        assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[7]))
      })

      it('due to insufficient gas in called contract', async () => {
        const to = this.counter.address
        const gas = toBN(10)
        const timestamp = await time.latest()
        const timestampInsideWindow = timestamp.add(insideWindow(plans[0].window))
        const from = this.schedulingRequestor
        await this.token.approve(this.oneShotSchedule.address, plans[0].price, { from })
        await this.oneShotSchedule.purchase(toBN(0), toBN(1), { from })
        await this.oneShotSchedule.schedule(0, to, failData, gas, timestampInsideWindow, { from })
        const receipt = await this.oneShotSchedule.execute(0)
        expectEvent(receipt, 'MetatransactionExecuted', {
          index: toBN(0),
          success: false,
        })
        assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[7]))
      })
    })
  })
})
