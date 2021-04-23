const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677') // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const { plans } = require('./common.js')

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
  })

  describe('purchase', () => {
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

      this.testERC677Purchase = async (plan, schedulings, totalToTransfer) => {
        const encodedData = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [plan.toString(), schedulings.toString()])
        await this.token.transferAndCall(this.oneShotSchedule.address, totalToTransfer, encodedData, { from: this.schedulingRequestor })
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(this.schedulingRequestor, plan)
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

      it("shouldn't purchase if the plan is cancelled  - ERC20", async ()=>{
        await this.oneShotSchedule.cancelPlan(0, { from: this.serviceProviderAccount })
        await expectRevert(this.testPurchaseWithValue(0, toBN(1)),"Inactive plan")
      })
      it("shouldn't purchase if the plan is cancelled  - ERC677", async ()=>{
          await this.oneShotSchedule.cancelPlan(0, { from: this.serviceProviderAccount })
          await expectRevert(this.testERC677Purchase(0, toBN(10), plans[0].price.mul(toBN(10))),"Inactive plan")
      })
    })
  })
})
