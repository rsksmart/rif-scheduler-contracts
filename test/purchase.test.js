const assert = require('assert')
const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const { plans, setupContracts } = require('./common.js')

contract('RIFScheduler - purchase', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, token2, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.rifScheduler = rifScheduler
    this.token2 = token2

    await this.rifScheduler.addPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, { from: this.serviceProvider })
    await this.rifScheduler.addPlan(plans[1].price, plans[1].window, plans[1].gasLimit, constants.ZERO_ADDRESS, {
      from: this.serviceProvider,
    })
    await this.rifScheduler.addPlan(toBN(0), plans[1].window, plans[1].gasLimit, this.token.address, { from: this.serviceProvider }) //free plan
    await this.rifScheduler.addPlan(toBN(0), plans[1].window, plans[1].gasLimit, constants.ZERO_ADDRESS, { from: this.serviceProvider }) //free plan

    this.testERC20Purchase = async (planId, value) => {
      const plan = await this.rifScheduler.plans(planId)
      await this.token.approve(this.rifScheduler.address, toBN(1000), { from: this.requestor })
      await this.rifScheduler.purchase(planId, value, { from: this.requestor })
      const scheduled = await this.rifScheduler.remainingExecutions(this.requestor, planId)
      const contractBalance = await this.token.balanceOf(this.rifScheduler.address)

      assert.strictEqual(scheduled.toString(10), value.toString(10), `Didn't schedule ${value}`)
      assert.strictEqual(contractBalance.toString(10), value.mul(toBN(plan.pricePerExecution)).toString(10), 'Balance mismatch')
    }

    this.testERC677Purchase = async (plan, executions, totalToTransfer) => {
      const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [plan.toString(), executions.toString()])
      await this.token.transferAndCall(this.rifScheduler.address, totalToTransfer, encodedData, { from: this.requestor })
      const scheduled = await this.rifScheduler.remainingExecutions(this.requestor, plan)
      const contractBalance = await this.token.balanceOf(this.rifScheduler.address)

      assert.strictEqual(scheduled.toString(10), executions.toString(10), `Didn't schedule ${executions.toString(10)}`)
      assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(), 'Balance mismatch')
    }

    this.testRBTCPurchase = async (plan, executions, totalToTransfer) => {
      await this.rifScheduler.purchase(plan, executions, { from: this.requestor, value: totalToTransfer })
      const scheduled = await this.rifScheduler.remainingExecutions(this.requestor, plan)
      const contractBalance = await web3.eth.getBalance(this.rifScheduler.address)

      assert.strictEqual(scheduled.toString(10), executions.toString(10), `Didn't schedule ${executions}`)
      assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(10), 'Balance mismatch')
    }
  })

  it('should receive RIF tokens to purchase 1 executions -  ERC677 way', () => this.testERC677Purchase(0, toBN(1), plans[0].price))
  it('should receive RIF tokens to purchase 10 executions -  ERC677 way', () =>
    this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))))

  it('should receive RIF tokens to purchase 1 executions - ERC20 way', () => this.testERC20Purchase(0, toBN(1)))
  it('should receive RIF tokens to purchase 10 executions  - ERC20 way', () => this.testERC20Purchase(0, toBN(10)))

  it('should receive rBTC tokens to purchase 10 executions', () => this.testRBTCPurchase(1, toBN(10), plans[1].price.mul(toBN(10))))

  describe('failing purchases', () => {
    it("should reject if payment doesn't match total amount'", () =>
      expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price), "Transferred amount doesn't match total purchase"))

    it("shouldn't purchase if payed with wrong token  - ERC677", async () => {
      const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], ['0', '1'])
      return expectRevert(
        this.token2.transferAndCall(this.rifScheduler.address, toBN(10), encodedData, { from: this.requestor }),
        'Bad token'
      )
    })
    it("shouldn't purchase if the plan is cancelled  - ERC20", async () => {
      await this.rifScheduler.removePlan(0, { from: this.serviceProvider })
      return expectRevert(this.testERC20Purchase(0, toBN(1)), 'Inactive plan')
    })
    it("shouldn't purchase if the plan is cancelled  - ERC677", async () => {
      await this.rifScheduler.removePlan(0, { from: this.serviceProvider })
      return expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))), 'Inactive plan')
    })
    it("shouldn't purchase if payment fails", () =>
      // making it fail because there's no amount approved
      expectRevert.unspecified(this.rifScheduler.purchase(0, 1, { from: this.requestor })))
    it('should revert rBTC not accepted for the plan', () =>
      expectRevert(this.testRBTCPurchase(0, toBN(10), plans[0].price.mul(toBN(10))), 'rBTC not accepted for this plan'))
    it('should revert, payed with rBTC with wrong amount', () =>
      expectRevert(this.testRBTCPurchase(1, toBN(10), plans[1].price), "Transferred amount doesn't match total purchase."))
  })
  describe('Cancel Plan', () => {
    beforeEach(() => {
      this.getBalance = (token) => (token === constants.ZERO_ADDRESS ? web3.eth.getBalance : this.token.balanceOf)
    })

    it('should reject if not paused', () =>
      expectRevert(this.rifScheduler.requestPlanRefund(0, { from: this.requestor }), 'Pausable: not paused'))

    it('No balance to refund', async () => {
      await this.rifScheduler.pause({ from: this.serviceProvider })
      return expectRevert(this.rifScheduler.requestPlanRefund(1000, { from: this.requestor }), 'No balance to refund')
    })

    it('should cancel the plans - ERC20/677', async () => {
      const planId = 0
      const quantity = toBN(10)
      const plan = await this.rifScheduler.plans(planId)
      const initialRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      await this.testERC20Purchase(planId, quantity)
      await this.rifScheduler.pause({ from: this.serviceProvider })
      await this.rifScheduler.requestPlanRefund(planId, { from: this.requestor })
      const finalRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      const finalRemainingExecutions = await this.rifScheduler.remainingExecutions(this.requestor, planId)
      assert.strictEqual(finalRemainingExecutions.toString(), '0', 'Not refunded')
      assert.strictEqual(initialRequestorBalance.sub(finalRequestorBalance).toString(), '0', "Balance doesn't match")
    })

    it('should cancel the plans - ERC20/677 - free', async () => {
      const planId = 2
      const quantity = toBN(10)
      const plan = await this.rifScheduler.plans(planId)
      const initialRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      await this.testERC20Purchase(planId, quantity)
      await this.rifScheduler.pause({ from: this.serviceProvider })
      await this.rifScheduler.requestPlanRefund(planId, { from: this.requestor })
      const finalRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      const finalRemainingExecutions = await this.rifScheduler.remainingExecutions(this.requestor, planId)
      assert.strictEqual(finalRemainingExecutions.toString(), '0', 'Not refunded')
      assert.strictEqual(initialRequestorBalance.sub(finalRequestorBalance).toString(), '0', "Balance doesn't match")
    })

    it('should cancel the plans - rBTC', async () => {
      const planId = 1
      const quantity = toBN(10)
      const plan = await this.rifScheduler.plans(planId)
      const totalAmount = quantity.mul(toBN(plan.pricePerExecution))
      await this.testRBTCPurchase(planId, quantity, totalAmount)
      const initialRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor)).add(totalAmount)
      await this.rifScheduler.pause({ from: this.serviceProvider })
      const refundTx = await this.rifScheduler.requestPlanRefund(planId, { from: this.requestor })
      const tx = await web3.eth.getTransaction(refundTx.tx)
      const refundTxUsedGas = toBN(refundTx.receipt.gasUsed * tx.gasPrice)
      const finalRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      const finalRemainingExecutions = await this.rifScheduler.remainingExecutions(this.requestor, planId)

      assert.strictEqual(finalRemainingExecutions.toString(), '0', 'Not refunded')
      assert.strictEqual(initialRequestorBalance.sub(finalRequestorBalance.add(refundTxUsedGas)).toString(), '0', "Balance doesn't match")
    })

    it('should cancel free plans - rBTC', async () => {
      const planId = 3
      const quantity = toBN(10)
      const plan = await this.rifScheduler.plans(planId)
      const totalAmount = quantity.mul(toBN(plan.pricePerExecution))
      await this.testRBTCPurchase(planId, quantity, totalAmount)
      const initialRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor)).add(totalAmount)
      await this.rifScheduler.pause({ from: this.serviceProvider })
      const refundTx = await this.rifScheduler.requestPlanRefund(planId, { from: this.requestor })
      const tx = await web3.eth.getTransaction(refundTx.tx)
      const refundTxUsedGas = toBN(refundTx.receipt.gasUsed * tx.gasPrice)
      const finalRequestorBalance = toBN(await this.getBalance(plan.token)(this.requestor))
      const finalRemainingExecutions = await this.rifScheduler.remainingExecutions(this.requestor, planId)

      assert.strictEqual(finalRemainingExecutions.toString(), '0', 'Not refunded')
      assert.strictEqual(initialRequestorBalance.sub(finalRequestorBalance.add(refundTxUsedGas)).toString(), '0', "Balance doesn't match")
    })
  })
})
