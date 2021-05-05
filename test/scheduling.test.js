const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils
const { plans, MetaTransactionState, setupContracts, insideWindow, outsideWindow } = require('./common.js')
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent')

const getMethodSig = (method) => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')

contract('OneShotSchedule - scheduling', (accounts) => {
  beforeEach(async () => {
    this.initialSnapshot = timeMachine.takeSnapshot()
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
    return expectRevert(this.testScheduleWithValue(0, toBN(1e15), nearPast), 'Cannot schedule it in the past')
  })

  it('cannot schedule if requestor has no balance', async () => {
    const nearFuture = (await time.latest()) + 100
    // buy one, use one
    await this.testScheduleWithValue(0, toBN(0), nearFuture)
    // try to schedule another
    return expectRevert(
      this.oneShotSchedule.schedule(0, this.counter.address, incData, toBN(await this.counter.inc.estimateGas()), nearFuture, {
        from: this.requestor,
        value: toBN(0),
      }),
      'No balance available'
    )
  })

  describe('Scheduling cancelation', () => {
    beforeEach(() => {
      this.scheduleOneValid = async (value) => {
        const timestamp = await time.latest()
        const scheduleTime = timestamp.add(outsideWindow(0))
        await this.testScheduleWithValue(0, value, scheduleTime)
      }
    })

    it('should schedule, cancel metatransaction and refund', async () => {
      const valueForTx = toBN(1e15)
      await this.scheduleOneValid(valueForTx)
      const requestorBalanceAfterSchedule = toBN(await web3.eth.getBalance(this.requestor))
      const cancelTx = await this.oneShotSchedule.cancelScheduling(0, { from: this.requestor })

      expectEvent(cancelTx, 'MetatransactionCancelled', { index: toBN(0) })

      //State should be Cancelled
      const scheduling = await this.oneShotSchedule.getSchedule(0)
      assert.strictEqual(scheduling[7].toString(), MetaTransactionState.Cancelled, 'Not cancelled')

      //Scheduling should be refunded
      assert.strictEqual(
        (await this.oneShotSchedule.getRemainingSchedulings(this.requestor, toBN(0))).toString(),
        '1',
        'Schedule not refunded'
      )

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

    it('should fail to cancel a cancelled metatransaction', async () => {
      await this.scheduleOneValid(toBN(1e15))
      await this.oneShotSchedule.cancelScheduling(0, { from: this.requestor })
      return expectRevert(this.oneShotSchedule.cancelScheduling(0, { from: this.requestor }), 'Transaction not scheduled')
    })

    it('should fail to cancel transactions if not the requestor', async () => {
      await this.scheduleOneValid(toBN(1e15))
      return expectRevert(this.oneShotSchedule.cancelScheduling(0, { from: this.serviceProvider }), 'Not authorized')
    })

    it('should fail to cancel transactions after execution window', async () => {
      const timestamp = await time.latest()
      const timestampOutsideWindow = timestamp.add(outsideWindow(0))
      await this.testScheduleWithValue(0, toBN(1e15), timestamp)
      await time.increaseTo(timestampOutsideWindow)
      await time.advanceBlock()
      return expectRevert(
        this.oneShotSchedule.cancelScheduling(0, { from: this.requestor }),
        'Transaction not scheduled'
      )
    })
  })

  afterEach(() => timeMachine.revertToSnapshot(this.initialSnapshot))
})
