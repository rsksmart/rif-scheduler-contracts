const assert = require('assert')
const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const { plans, setupContracts } = require('./common.js')

contract('OneShotSchedule - purchase', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, token2, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule
    this.token2 = token2

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })
    await this.oneShotSchedule.addPlan(plans[1].price, plans[1].window, constants.ZERO_ADDRESS, { from: this.serviceProvider })

    this.testPurchaseWithValue = async (plan, value) => {
      await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.requestor })
      await this.oneShotSchedule.purchase(plan, value, { from: this.requestor })
      const scheduled = await this.oneShotSchedule.remainingExecutions(this.requestor, plan)
      const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

      assert.strictEqual(scheduled.toString(10), value.toString(10), `Didn't schedule ${value}`)
      assert.strictEqual(contractBalance.toString(10), value.mul(plans[0].price).toString(10), 'Balance mismatch')
    }

    this.testERC677Purchase = async (plan, executions, totalToTransfer) => {
      const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [plan.toString(), executions.toString()])
      await this.token.transferAndCall(this.oneShotSchedule.address, totalToTransfer, encodedData, { from: this.requestor })
      const scheduled = await this.oneShotSchedule.remainingExecutions(this.requestor, plan)
      const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

      assert.strictEqual(scheduled.toString(10), executions.toString(10), `Didn't schedule ${executions.toString(10)}`)
      assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(), 'Balance mismatch')
    }

    this.testRBTCPurchase = async (plan, executions, totalToTransfer) => {
      await this.oneShotSchedule.purchase(plan, executions, { from: this.requestor, value: totalToTransfer })
      const scheduled = await this.oneShotSchedule.remainingExecutions(this.requestor, plan)
      const contractBalance = await web3.eth.getBalance(this.oneShotSchedule.address)

      assert.strictEqual(scheduled.toString(10), executions.toString(10), `Didn't schedule ${executions}`)
      assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(10), 'Balance mismatch')
    }
  })

  it('should receive RIF tokens to purchase 1 executions -  ERC677 way', () => this.testERC677Purchase(0, toBN(1), plans[0].price))
  it('should receive RIF tokens to purchase 10 executions -  ERC677 way', () =>
    this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))))

  it('should receive RIF tokens to purchase 1 executions - ERC20 way', () => this.testPurchaseWithValue(0, toBN(1)))
  it('should receive RIF tokens to purchase 10 executions  - ERC20 way', () => this.testPurchaseWithValue(0, toBN(10)))

  it('should receive rBTC tokens to purchase 10 executions', () => this.testRBTCPurchase(1, toBN(10), plans[1].price.mul(toBN(10))))

  describe('failing purchases', () => {
    it("should reject if payment doesn't match total amount'", () =>
      expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price), "Transferred amount doesn't match total purchase"))

    it("shouldn't purchase if payed with wrong token  - ERC677", async () => {
      const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], ['0', '1'])
      return expectRevert(
        this.token2.transferAndCall(this.oneShotSchedule.address, toBN(10), encodedData, { from: this.requestor }),
        'Bad token'
      )
    })
    it("shouldn't purchase if the plan is cancelled  - ERC20", async () => {
      await this.oneShotSchedule.removePlan(0, { from: this.serviceProvider })
      return expectRevert(this.testPurchaseWithValue(0, toBN(1)), 'Inactive plan')
    })
    it("shouldn't purchase if the plan is cancelled  - ERC677", async () => {
      await this.oneShotSchedule.removePlan(0, { from: this.serviceProvider })
      return expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))), 'Inactive plan')
    })
    it("shouldn't purchase if payment fails", () =>
      // making it fail because there's no amount approved
      expectRevert.unspecified(this.oneShotSchedule.purchase(0, 1, { from: this.requestor })))
    it('should revert rBTC not accepted for the plan', () =>
      expectRevert(this.testRBTCPurchase(0, toBN(10), plans[0].price.mul(toBN(10))), 'rBTC not accepted for this plan'))
    it('should revert, payed with rBTC with wrong amount', () =>
      expectRevert(this.testRBTCPurchase(1, toBN(10), plans[1].price), "Transferred amount doesn't match total purchase."))
  })
})
