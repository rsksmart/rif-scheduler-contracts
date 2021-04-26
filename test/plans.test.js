const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

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
    ;[this.contractAdmin, this.serviceProvider, this.schedulingRequestor, this.serviceProviderAdmin] = accounts
    await timeMachine.revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProviderAdmin, this.serviceProvider)
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

    it('should add a plan', () => this.testAddPlan(plans[0].price, plans[0].window, this.serviceProviderAdmin))
    it('should add two plans', async () => {
      await this.testAddPlan(plans[0].price, plans[0].window, this.serviceProviderAdmin)
      await this.testAddPlan(plans[1].price, plans[1].window, this.serviceProviderAdmin)
    })

    it('should reject plans added by other users', async () =>
      await expectRevert(this.testAddPlan(plans[0].price, plans[0].window, this.schedulingRequestor), 'Not authorized'))

    it('should cancel a plan', () => this.testCancelPlan(this.serviceProviderAdmin))

    it("should reject to cancel a plan if it's not the provider", () =>
      expectRevert(this.testCancelPlan(this.schedulingRequestor), 'Not authorized'))

    it('should reject to cancel if the plan is not active', async () => {
      await this.testCancelPlan(this.serviceProviderAdmin)
      await expectRevert(this.testCancelPlan(this.serviceProviderAdmin), 'The plan is not active')
    })
  })
})
