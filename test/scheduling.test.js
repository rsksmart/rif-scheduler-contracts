const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677') // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils
const { plans, MetaTransactionState } = require('./common.js')

const getMethodSig = (method) => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')

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
  })

  describe('scheduling', () => {
    beforeEach(async () => {
      await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })
      this.testScheduleWithValue = async (plan, value, timestamp) => {
        const to = this.counter.address
        const gas = this.gas
        await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.requestor })
        await this.oneShotSchedule.purchase(plan, 1, { from: this.requestor })
        await this.oneShotSchedule.schedule(plan, to, incData, gas, timestamp, { from: this.requestor, value })
        const actual = await this.oneShotSchedule.getSchedule(0)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.requestor, plan)

        assert.strictEqual(actual[0], this.requestor, 'Not scheduled for this user')
        assert.strictEqual(actual[1].toString(), toBN(plan).toString(), 'Wrong plan')
        assert.strictEqual(actual[2], to, 'Wrong contract address')
        assert.strictEqual(actual[3], incData)
        assert.strictEqual(actual[4].toString(), gas.toString())
        assert.strictEqual(actual[5].toString(), timestamp.toString())
        assert.strictEqual(actual[6].toString(), value.toString())
        assert.strictEqual(actual[7].toString(), MetaTransactionState.Scheduled)

        assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
      }
    })

    it('schedule a new metatransaction', async () => {
      const nearFuture = (await time.latest()) + 100
      return this.testScheduleWithValue(0, toBN(0), nearFuture)
    })

    it('schedule a new metatransaction with value', async () => {
      const nearFuture = (await time.latest()) + 100
      return this.testScheduleWithValue(0, toBN(1e15), nearFuture)
    })

    it('cannot schedule in the past', async () => {
      const nearPast = (await time.latest()) - 1000
      await expectRevert(this.testScheduleWithValue(0, toBN(1e15), nearPast), 'Cannot schedule it in the past')
    })
    it('cannot schedule requestor has no balance', async () => {
      const nearFuture = (await time.latest()) + 100
      // buy one, use one
      await this.testScheduleWithValue(0, toBN(0), nearFuture)
      // try to schedule another
      return expectRevert(
        this.oneShotSchedule.schedule(0, this.counter.address, incData, this.gas, nearFuture, {
          from: this.requestor,
          value: toBN(0),
        }),
        'No balance available'
      )
    })
  })
})
