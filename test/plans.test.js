const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

const assert = require('assert')
const { expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers')
const timeMachine = require('ganache-time-traveler')
const { toBN } = web3.utils

const { plans } = require('./common.js')

let initialSnapshot = null
timeMachine.takeSnapshot().then((id) => {
  initialSnapshot = id
})

contract('OneShotSchedule', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts
    await timeMachine.revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    this.oneShotSchedule = await OneShotSchedule.new(this.serviceProvider, this.payee)
  })

  describe('plans', () => {
    beforeEach(async () => {
      this.testAddPlan = async (price, window, token, account) => {
        const receipt = await this.oneShotSchedule.addPlan(price, window, token, { from: account })
        expectEvent(receipt, 'PlanAdded', {
          price: price,
          window: window,
          token: token,
        })
      }

      this.testCancelPlan = async (account) => {
        await this.testAddPlan(plans[0].price, plans[0].window, this.token.address, account)
        const planActive = await this.oneShotSchedule.getPlan(0)
        assert.strictEqual(planActive.active, true, `The plan is not active`)
        await this.oneShotSchedule.cancelPlan(0, { from: account })
        const planInactive = await this.oneShotSchedule.getPlan(0)
        assert.strictEqual(planInactive.active, false, `Didn't cancel the plan`)
      }
    })

    it('should add a plan', () => this.testAddPlan(plans[0].price, plans[0].window, this.token.address, this.serviceProvider))
    it('should add two plans', async () => {
      await this.testAddPlan(plans[0].price, plans[0].window, this.token.address, this.serviceProvider)
      await this.testAddPlan(plans[1].price, plans[1].window, this.token.address, this.serviceProvider)
    })

    it('should reject if token is not defined', () =>
      expectRevert(
        this.testAddPlan(plans[1].price, plans[1].window, constants.ZERO_ADDRESS, this.serviceProvider),
        'Token address cannot be 0x0'
      ))

    it('should reject plans added by other users', () =>
      expectRevert(this.testAddPlan(plans[0].price, plans[0].window, this.token.address, this.requestor), 'Not authorized'))

    it('should cancel a plan', () => this.testCancelPlan(this.serviceProvider))

    it("should reject to cancel a plan if it's not the provider", () => expectRevert(this.testCancelPlan(this.requestor), 'Not authorized'))

    it('should reject to cancel if the plan is not active', async () => {
      await this.testCancelPlan(this.serviceProvider)
      return expectRevert(this.oneShotSchedule.cancelPlan(0, { from: this.serviceProvider }), 'The plan is already inactive')
    })
  })
})
