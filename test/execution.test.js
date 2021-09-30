const PayableContract = artifacts.require('PayableContract')
const NotPayable = artifacts.require('NotPayable')
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const ONE_DAY = 60 * 60 * 24 // in seconds
const { plans, ExecutionState, setupContracts, insideWindow, outsideWindow, getExecutionId, getMethodSig } = require('./common.js')

const incData = getMethodSig({ inputs: [], name: 'inc', type: 'function' })
const failData = getMethodSig({ inputs: [], name: 'fail', type: 'function' })

contract('RIFScheduler - execution', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider, this.anotherAccount] = accounts

    const { token, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.rifScheduler = rifScheduler

    this.counter = await Counter.new()

    this.getState = (executionId) => this.rifScheduler.getState(executionId).then((state) => state.toString())

    await this.rifScheduler.addPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, { from: this.serviceProvider })
    plans[0].token = this.token.address
    await this.rifScheduler.addPlan(plans[1].price, plans[1].window, plans[1].gasLimit, constants.ZERO_ADDRESS, {
      from: this.serviceProvider,
    })
    plans[1].token = constants.ZERO_ADDRESS
    await this.rifScheduler.addPlan(plans[2].price, plans[2].window, plans[2].gasLimit, this.token.address, { from: this.serviceProvider })
    plans[2].token = this.token.address

    this.payWithRBTC = (planId) => plans[planId].token === constants.ZERO_ADDRESS

    this.testScheduleWithValue = async (planId, data, value, timestamp) => {
      const to = this.counter.address
      const from = this.requestor
      if (this.payWithRBTC(planId)) {
        await this.rifScheduler.purchase(planId, toBN(1), { from, value: plans[planId].price })
      } else {
        await this.token.approve(this.rifScheduler.address, plans[planId].price, { from })
        await this.rifScheduler.purchase(planId, toBN(1), { from })
      }
      const scheduleReceipt = await this.rifScheduler.schedule(planId, to, data, timestamp, { from, value })
      return getExecutionId(scheduleReceipt)
    }

    this.executeWithTime = async (txId, executionTimestamp) => {
      await time.increaseTo(executionTimestamp)
      await time.advanceBlock()
      return this.rifScheduler.execute(txId, { from: this.serviceProvider })
    }

    this.testExecutionWithValue = async (value, planId, payee) => {
      const payee_ = payee || this.payee
      const timestamp = await time.latest()
      const insideWindowTime = timestamp.add(insideWindow(planId))
      const plan = plans[planId]
      const getBalance = this.payWithRBTC(planId) ? web3.eth.getBalance : this.token.balanceOf
      const initialPayeeBalance = await getBalance(payee_)
      const initialContractBalance = await getBalance(this.rifScheduler.address)
      const txId = await this.testScheduleWithValue(planId, incData, value, insideWindowTime)
      const receipt = await this.executeWithTime(txId, insideWindowTime)

      expectEvent(receipt, 'Executed', {
        id: txId,
        success: true,
      })

      // Transaction executed status
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionSuccessful, 'Execution failed')
      // Transaction executed on contract
      assert.strictEqual(await this.counter.count().then((r) => r.toString()), '1', 'Counter difference')
      // Value transferred to contract
      assert.strictEqual(await web3.eth.getBalance(this.counter.address).then((r) => r.toString()), value.toString(), 'wrong balance')
      // token balance transferred from contract to provider
      const expectedPayeeBalance = toBN(initialPayeeBalance).add(plan.price)
      assert.strictEqual(await getBalance(payee_).then((r) => r.toString()), expectedPayeeBalance.toString(), 'wrong provider balance')
      assert.strictEqual(
        await getBalance(this.rifScheduler.address).then((r) => r.toString()),
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

    it('executes a listed a execution after plan cancellation', async () => {
      const timestamp = await time.latest()
      const planId = 0
      const insideWindowTime = timestamp.add(insideWindow(planId))
      const txId = await this.testScheduleWithValue(planId, incData, 0, insideWindowTime)

      // cancel plan
      await this.rifScheduler.removePlan(planId, { from: this.serviceProvider })
      const planFromContract = await this.rifScheduler.plans(planId)
      assert.strictEqual(planFromContract.active, false, 'Plan not cancelled')

      // Execute transaction and check status
      await this.executeWithTime(txId, insideWindowTime)
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionSuccessful, 'Execution failed')
    })

    it('should execute and pay rBTC to a contract address', async () => {
      // set payee to a payable contract address
      const payableContract = await PayableContract.new()
      await this.rifScheduler.setPayee(payableContract.address, { from: this.serviceProvider })
      return this.testExecutionWithValue(toBN(1e15), 1, payableContract.address)
    })

    it('should transfer rBTC to an EOA address', async () => {
      const from = this.requestor
      const payTo = this.anotherAccount
      const valueForTx = toBN(10)

      const initialBalance = await web3.eth.getBalance(payTo)

      const timestamp = await time.latest()
      const planId = 1
      const insideWindowTime = timestamp.add(insideWindow(planId))

      await this.rifScheduler.purchase(planId, toBN(1), { from, value: plans[planId].price })
      const scheduleReceipt = await this.rifScheduler.schedule(planId, payTo, '0x', insideWindowTime, { from, value: valueForTx })
      const txId = await getExecutionId(scheduleReceipt)
      await this.executeWithTime(txId, insideWindowTime)
      const finalBalance = await web3.eth.getBalance(payTo)
      const expectedBalance = toBN(initialBalance).add(valueForTx)
      assert.strictEqual(expectedBalance.toString(), finalBalance.toString(), 'Transaction value not transferred')
    })

    it('should execute and fail, then retry and success', async () => {
      const timestamp = await time.latest()
      const planId = 0
      const insideWindowTime = timestamp.add(insideWindow(planId))
      const txId = await this.testScheduleWithValue(planId, incData, 0, insideWindowTime)

      // remove providers balance
      const providerBalance = await web3.eth.getBalance(this.serviceProvider)
      const gas = toBN(21000)
      const gasPrice = toBN(await web3.eth.getGasPrice())
      var gasTotal = gasPrice.mul(gas)
      await web3.eth.sendTransaction({
        from: this.serviceProvider,
        to: this.anotherAccount,
        gas,
        value: toBN(providerBalance).sub(gasTotal).sub(toBN(1)),
      }) //
      // execute should fail
      try {
        await this.executeWithTime(txId, insideWindowTime)
      } catch (e) {
        assert.ok(e.message.indexOf("sender doesn't have enough funds to send tx.") > -1)
      }
      // return the balance
      await web3.eth.sendTransaction({ from: this.anotherAccount, to: this.serviceProvider, gas, value: toBN(providerBalance) })
      // retry
      await this.rifScheduler.execute(txId, { from: this.anotherAccount })
      // Transaction executed status
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionSuccessful, 'Execution failed')
    })
  })
  describe('refund', () => {
    beforeEach(() => {
      this.refundTest = async (planId) => {
        const timestamp = await time.latest()
        const valueForTx = toBN(10)
        // scheduled for tomorrow
        const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
        const txId = await this.testScheduleWithValue(planId, incData, valueForTx, scheduleTimestamp)
        const requestorBalanceAfterSchedule = toBN(await web3.eth.getBalance(this.requestor))
        const executionTimestamp = timestamp.add(toBN(ONE_DAY).add(outsideWindow(planId)))
        await time.increaseTo(executionTimestamp)
        await time.advanceBlock()
        const refundTx = await this.rifScheduler.requestExecutionRefund(txId, { from: this.requestor })
        expectEvent(refundTx, 'ExecutionRefunded')

        const tx = await web3.eth.getTransaction(refundTx.tx)
        const refundTxCost = toBN(refundTx.receipt.gasUsed * tx.gasPrice)
        const expectedRequestorBalance = requestorBalanceAfterSchedule.add(valueForTx).sub(refundTxCost)
        const finalRequestorBalance = toBN(await web3.eth.getBalance(this.requestor))
        assert.strictEqual(expectedRequestorBalance.toString(), finalRequestorBalance.toString(), 'Transaction value not refunded')

        assert.strictEqual(
          (await this.rifScheduler.remainingExecutions(this.requestor, toBN(planId))).toString(),
          '1',
          'Schedule not refunded'
        )
        assert.strictEqual(await this.getState(txId), ExecutionState.Refunded, 'Execution not failed')
      }
    })

    it('should refund if it executes after timestamp + window', () => this.refundTest(0))

    it('should refund if it executes after timestamp + window - rBTC', () => this.refundTest(1))

    it('should not refund if not overdue', async () => {
      const planId = 0
      const timestamp = await time.latest()
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const txId = await this.testScheduleWithValue(planId, incData, toBN(10), scheduleTimestamp)
      return expectRevert(this.rifScheduler.requestExecutionRefund(txId, { from: this.requestor }), 'Not overdue')
    })

    it('should not refund if not the requestor', async () => {
      const planId = 0
      const timestamp = await time.latest()
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const txId = await this.testScheduleWithValue(planId, incData, toBN(10), scheduleTimestamp)
      return expectRevert(this.rifScheduler.requestExecutionRefund(txId, { from: this.anotherAccount }), 'Not overdue')
    })
  })

  describe('failing', () => {
    it('cannot execute twice', async () => {
      const txId = await this.testExecutionWithValue(toBN(0), 0)
      return expectRevert(this.rifScheduler.execute(txId), 'Not scheduled')
    })

    it('cannot execute before timestamp - window', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const txId = await this.testScheduleWithValue(0, incData, toBN(10), scheduleTimestamp)
      // execute before window
      return expectRevert(this.executeWithTime(txId, timestamp.add(toBN(ONE_DAY).sub(outsideWindow(0)))), 'Too soon')
    })

    it('cannot execute after timestamp + window', async () => {
      const planId = 0
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const scheduleTimestamp = timestamp.add(toBN(ONE_DAY))
      const txId = await this.testScheduleWithValue(planId, incData, toBN(10), scheduleTimestamp)
      // execute after window
      return expectRevert(this.executeWithTime(txId, timestamp.add(toBN(ONE_DAY).add(outsideWindow(planId)))), 'Not scheduled')
    })

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

    it('should not execute and pay rBTC to a not payable contract address', async () => {
      // set payee to a payable contract address
      const payableContract = await NotPayable.new()
      await this.rifScheduler.setPayee(payableContract.address, { from: this.serviceProvider })
      return expectRevert.unspecified(this.testExecutionWithValue(toBN(1e15), 1, payableContract.address))
    })
  })

  describe('failing metatransactions - execution not failing', () => {
    it('due to revert in called contract', async () => {
      const timestamp = await time.latest()
      // scheduled for tomorrow
      const txId = await this.testScheduleWithValue(0, failData, toBN(0), timestamp.add(toBN(100)))
      const tx = await this.rifScheduler.execute(txId)
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
      const planId = 2
      const timestamp = await time.latest()
      const from = this.requestor
      const timestampInsideWindow = timestamp.add(insideWindow(0))
      await this.token.approve(this.rifScheduler.address, plans[planId].price, { from })
      await this.rifScheduler.purchase(toBN(planId), toBN(1), { from })
      const scheduleReceipt = await this.rifScheduler.schedule(planId, to, failData, timestampInsideWindow, { from })
      const txId = getExecutionId(scheduleReceipt)
      const receipt = await this.rifScheduler.execute(txId)
      expectEvent(receipt, 'Executed', {
        id: txId,
        success: false,
      })
      assert.strictEqual(await this.getState(txId), ExecutionState.ExecutionFailed, 'Execution did not fail')
    })
  })
})
