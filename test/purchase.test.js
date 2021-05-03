const assert = require('assert')
const { expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const { plans, setupContracts } = require('./common.js')

let initialSnapshot = null
timeMachine.takeSnapshot().then((id) => {
  initialSnapshot = id
})

contract('OneShotSchedule - purchase', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts
    await timeMachine.revertToSnapshot(initialSnapshot)

    const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule

    await this.oneShotSchedule.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })
    this.testPurchaseWithValue = async (plan, value) => {
      await this.token.approve(this.oneShotSchedule.address, toBN(1000), { from: this.requestor })
      await this.oneShotSchedule.purchase(plan, value, { from: this.requestor })
      const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.requestor, plan)
      const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

      assert.strictEqual(scheduled.toString(10), value.toString(10), `Didn't schedule ${value}`)
      assert.strictEqual(contractBalance.toString(10), value.mul(plans[0].price).toString(10), 'Balance mismatch')
    }

    this.testERC677Purchase = async (plan, schedulings, totalToTransfer) => {
      const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [plan.toString(), schedulings.toString()])
      await this.token.transferAndCall(this.oneShotSchedule.address, totalToTransfer, encodedData, { from: this.requestor })
      const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.requestor, plan)
      const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)

      assert.strictEqual(scheduled.toString(10), schedulings.toString(10), `Didn't schedule ${schedulings.toString(10)}`)
      assert.strictEqual(contractBalance.toString(10), totalToTransfer.toString(), 'Balance mismatch')
    }
  })

  it('should receive RIF tokens to purchase 1 scheduled -  ERC677 way', () => this.testERC677Purchase(0, toBN(1), plans[0].price))
  it('should receive RIF tokens to purchase 10 scheduled -  ERC677 way', () =>
    this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))))

  it('should receive RIF tokens to purchase 1 scheduled - ERC20 way', () => this.testPurchaseWithValue(0, toBN(1)))
  it('should receive RIF tokens to purchase 10 scheduled  - ERC20 way', () => this.testPurchaseWithValue(0, toBN(10)))

  describe('failing purchases', () => {
    it("should reject if payment doesn't match total amount'", () =>
      expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price), "Transferred amount doesn't match total purchase"))
    it("shouldn't purchase if the plan is cancelled  - ERC20", async () => {
      await this.oneShotSchedule.cancelPlan(0, { from: this.serviceProvider })
      await expectRevert(this.testPurchaseWithValue(0, toBN(1)), 'Inactive plan')
    })
    it("shouldn't purchase if the plan is cancelled  - ERC677", async () => {
      await this.oneShotSchedule.cancelPlan(0, { from: this.serviceProvider })
      await expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))), 'Inactive plan')
    })
    it("shouldn't purchase if payment fails", () =>
      // making it fail because there's no amount approved
      expectRevert.unspecified(this.oneShotSchedule.purchase(0, 1, { from: this.requestor })))
  })
})
