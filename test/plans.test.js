const assert = require('assert')
const { expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const { plans, setupContracts } = require('./common.js')

contract('OneShotSchedule - plans', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.oneShotSchedule = oneShotSchedule

    this.testAddPlan = async (price, window, token, account) => {
      const beforeCount = await this.oneShotSchedule.plansCount()
      const receipt = await this.oneShotSchedule.addPlan(price, window, token, { from: account })
      expectEvent(receipt, 'PlanAdded', {
        price: price,
        window: window,
        token: token,
      })
      const afterCount = await this.oneShotSchedule.plansCount()
      assert.strictEqual(beforeCount.add(toBN(1)).toString(), afterCount.toString(), `Count doesn't match`)
    }

it('initially has no plans', () => this.oneShotSchedule.plansCount().then(count => assert.strictEqual(count.toString(), '0'))

    this.testRemovePlan = async (account) => {
      await this.testAddPlan(plans[0].price, plans[0].window, this.token.address, account)
      const planActive = await this.oneShotSchedule.plans(0)
      assert.strictEqual(planActive.active, true, `The plan is not active`)
      await this.oneShotSchedule.removePlan(0, { from: account })
      const planInactive = await this.oneShotSchedule.plans(0)
      assert.strictEqual(planInactive.active, false, `Didn't cancel the plan`)
    }
  })

  it('initially has no plans', () => this.oneShotSchedule.plansCount().then((count) => assert.strictEqual(count.toString(), '0')))
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

  it('should cancel a plan', () => this.testRemovePlan(this.serviceProvider))

  it("should reject to cancel a plan if it's not the provider", () => expectRevert(this.testRemovePlan(this.requestor), 'Not authorized'))

  it('should reject to cancel if the plan is not active', async () => {
    await this.testRemovePlan(this.serviceProvider)
    return expectRevert(this.oneShotSchedule.removePlan(0, { from: this.serviceProvider }), 'The plan is already inactive')
  })
})
