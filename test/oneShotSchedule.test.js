const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677') // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { hasUncaughtExceptionCaptureCallback } = require('process')
const { time, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const insideWindow = (window) => window.sub(toBN(1000))
const outsideWindow = (window) => window.add(toBN(1000))

const getMethodSig = (method) => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')
const failData = getMethodSig('fail()')

const solidityError = (message) => ({
  message: `Returned error: VM Exception while processing transaction: revert ${message} -- Reason given: ${message}.`,
})

const plans = [
  { price: toBN(15), window: toBN(10000) },
  { price: toBN(4), window: toBN(300) },
]
let initialSnapshot = null
timeMachine.takeSnapshot().then((id) => {
  initialSnapshot = id
})

contract('OneShotSchedule', (accounts) => {
  beforeEach(async () => {
    this.contractAdmin = accounts[0]
    this.serviceProviderAccount = accounts[1]
    this.schedulingRequestor = accounts[2]

    await timeMachine.revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new( this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    await this.token.transfer(this.schedulingRequestor, 100000, { from: this.contractAdmin })

    this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProviderAccount)
    this.counter = await Counter.new()
  })

  describe('plans', () => {
    beforeEach(async () => {
      this.testAddPlan = async (price, window, account) => {
        const receipt = await this.oneShotSchedule.addPlan(price, window, { from: account })
        expectEvent(receipt, 'PlanAdded', {
          price: price,
          window: window,
        })
      }

      this.testCancelPlan = async (account) => {
        await this.testAddPlan(plans[0].price, plans[0].window, account)
        const planActive = await this.oneShotSchedule.getPlan(0)
        assert.strictEqual(planActive.active, true, `The plan is not active`)
        await this.oneShotSchedule.cancelPlan(0, { from: account })
        const planInactive = await this.oneShotSchedule.getPlan(0)
        assert.strictEqual(planInactive.active, false, `Didn't cancel the plan`)
      }
    })

    it('should add a plan', () => this.testAddPlan(plans[0].price, plans[0].window, this.serviceProviderAccount))
    it('should add two plans', async () => {
      await this.testAddPlan(plans[0].price, plans[0].window, this.serviceProviderAccount)
      await this.testAddPlan(plans[1].price, plans[1].window, this.serviceProviderAccount)
    })

    it('should reject plans added by other users', async () =>
      await expectRevert(this.testAddPlan(plans[0].price, plans[0].window, this.schedulingRequestor), 'Not authorized'))

    it('should cancel a plan', () => this.testCancelPlan(this.serviceProviderAccount))

    it("should reject to cancel a plan if it's not the provider", () =>
      expectRevert(this.testCancelPlan(this.schedulingRequestor), 'Not authorized'))

    it('should reject to cancel if the plan is not active', async () => {
      await this.testCancelPlan(this.serviceProviderAccount)
      await expectRevert(this.testCancelPlan(this.serviceProviderAccount), 'The plan is not active')
    })
  })

  describe('payments', () => {
    beforeEach(async () => {
      await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, { from: this.serviceProviderAccount })
      this.testPurchaseWithValue = async (plan, value) => {
        await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.schedulingRequestor })
        await this.oneShotSchedule.purchase(plan, value, { from: this.schedulingRequestor })
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.schedulingRequestor, plan)
        const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

        assert.strictEqual(scheduled.toString(10), value.toString(10), `Didn't schedule ${value}`)
        assert.strictEqual(contractBalance.toString(10), value.mul(plans[0].price).toString(10), 'Balance mismatch')
      }

      this.testERC677Purchase = async (plan, _schedulings, _totalToTransfer) => {
        const schedulings = toBN(_schedulings)
        const totalToTransfer = toBN(_totalToTransfer)
        const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [plan.toString(), schedulings.toString()])
        await this.token.transferAndCall(this.oneShotSchedule.address, totalToTransfer, encodedData, { from: this.schedulingRequestor })
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.schedulingRequestor, plan)
        const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

        assert.strictEqual(scheduled.toString(10), schedulings.toString(10), `Didn't schedule ${schedulings.toString(10)}`)
        assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(), 'Balance mismatch')
      }
    })

    it('should receive RIF tokens to purchase 1 scheduled -  ERC677 way', () => this.testERC677Purchase(0, 1, plans[0].price))
    it('should receive RIF tokens to purchase 1 scheduled -  ERC677 way', () =>
      this.testERC677Purchase(0, 10, plans[0].price.mul(toBN(10))))

    it("should reject if payment doesn't match total amount'", () =>
      assert.rejects(this.testERC677Purchase(10, plans[0].price), "Transferred amount doesn't match total purchase"))

    it('should receive RIF tokens to purchase 1 scheduled - ERC20 way', () => this.testPurchaseWithValue(0, toBN(1)))
    it('should receive RIF tokens to purchase 10 scheduled  - ERC20 way', () => this.testPurchaseWithValue(0, toBN(10)))

    // it('should reject if not approved', () => assert.rejects(this.testPurchaseWithValue(toBN(1e15)), 'Allowance Exceeded'))
  })

  describe('scheduling', () => {
    beforeEach(async () => {
      await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, { from: this.serviceProviderAccount })
      this.testScheduleWithValue = async (plan, value, timestamp) => {
        const to = this.counter.address
        const gas = toBN(await this.counter.inc.estimateGas())
        await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.schedulingRequestor })
        await this.oneShotSchedule.purchase(plan, 1, { from: this.schedulingRequestor })
        await this.oneShotSchedule.schedule(plan, to, incData, gas, timestamp, { from: this.schedulingRequestor, value })
        const actual = await this.oneShotSchedule.getSchedule(0)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.schedulingRequestor, plan)

        assert.strictEqual(actual[0], this.schedulingRequestor, 'Not scheduled for this user')
        assert.strictEqual(actual[1].toString(), toBN(plan).toString(), 'Wrong plan')
        assert.strictEqual(actual[2], to, 'Wrong contract address')
        assert.strictEqual(actual[3], incData)
        assert.strictEqual(actual[4].toString(), gas.toString())
        assert.strictEqual(actual[5].toString(), timestamp.toString())
        assert.strictEqual(actual[6].toString(), value.toString())
        assert.strictEqual(actual[7], false)

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
      return await assert.rejects(this.testScheduleWithValue(0, toBN(1e15), nearPast), solidityError('Cannot schedule it in the past'))
    })
  })

  describe('execution', async () => {
    beforeEach(async () => {
      await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, { from: this.serviceProviderAccount })
      this.testScheduleWithValue = async (plan, value, timestamp) => {
        const to = this.counter.address
        const from = this.schedulingRequestor
        const gas = toBN(await this.counter.inc.estimateGas())
        await this.token.approve(this.oneShotSchedule.address, plans[plan].price, { from })
        await this.oneShotSchedule.purchase(plan, toBN(1), { from })
        return await this.oneShotSchedule.schedule(plan, to, incData, gas, timestamp, { from, value })
      }

      this.addAndExecuteWithTimes = async (value, scheduleTimestamp, executionTimestamp) => {
        await this.testScheduleWithValue(0, value, scheduleTimestamp)
        await time.increaseTo(executionTimestamp)
        await time.advanceBlock()
        return await this.oneShotSchedule.execute(0)
      }

      this.testExecutionWithValue = async (value) => {
        await time.advanceBlock()
        const timestamp = await time.latest()
        const insideWindowTime = timestamp.add(insideWindow(plans[0].window))
        await this.addAndExecuteWithTimes(value, insideWindowTime, insideWindowTime) //near future inside the window

        assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[7]), 'Not ok')
        assert.strictEqual(await this.counter.count().then((r) => r.toString()), '1', 'Counter difference')
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then((r) => r.toString()), value.toString(), 'wrong balance')
      }
    })

    it('executes a listed a metatransaction', () => this.testExecutionWithValue(toBN(0)))
    it('executes a listed a metatransaction with value', () => this.testExecutionWithValue(toBN(1e15)))

    it('cannot execute twice', async () => {
      await this.testExecutionWithValue(toBN(0))
      await assert.rejects(this.oneShotSchedule.execute(0), solidityError('Already executed'))
    })

    it('cannot execute before timestamp - window', async () => {
      const timestamp = await time.latest()
      await assert.rejects(
        this.addAndExecuteWithTimes(
          toBN(0),
          timestamp.add(toBN(60 * 60 * 24)), // scheduled for tomorrow
          timestamp.add(toBN(60 * 60 * 24 - outsideWindow(plans[0].window)))
        ), // before window
        solidityError('Too soon')
      )
    })

    it('cannot execute after timestamp + window', async () => {
      const timestamp = await time.latest()
      await assert.rejects(
        this.addAndExecuteWithTimes(
          toBN(0),
          timestamp.add(toBN(60 * 60 * 24)), // scheduled for tomorrow
          timestamp.add(toBN(60 * 60 * 24 + outsideWindow(plans[0].window)))
        ), // after window
        solidityError('Too late')
      )
    })

    describe('failing metatransactions', () => {
      // it('due to revert in called contract', async () => {
      //   const to = this.counter.address
      //   const gas = toBN(await this.counter.fail.estimateGas())
      //   const timestamp = await time.latest()
      //   await this.oneShotSchedule.purchase(toBN(0), toBN(1), { from: this.schedulingRequestor })
      //   await this.oneShotSchedule.schedule(0, to, failData, gas, timestamp, { from: this.schedulingRequestor })
      //   const receipt = await this.oneShotSchedule.execute(0)
      //   expectEvent(receipt, 'MetatransactionExecuted', {
      //     success: false,
      //     result: 'Boom',
      //   })

      //   assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[5]))
      // })

      it('due to insufficient gas in called contract', async () => {
        const to = this.counter.address
        const gas = toBN(10)
        const timestamp = await time.latest()
        const from = this.schedulingRequestor
        await this.token.approve(this.oneShotSchedule.address, plans[0].price, { from })
        await this.oneShotSchedule.purchase(toBN(0), toBN(1), { from })
        await this.oneShotSchedule.schedule(0, to, failData, gas, timestamp, { from })
        const tx = await this.oneShotSchedule.execute(0)
        const log = tx.logs.find((l) => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(await this.oneShotSchedule.getSchedule(0).then((meta) => meta[5]))
      })
    })
  })
})
