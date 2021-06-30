const assert = require('assert')
const { expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

const { plans, setupContracts } = require('./common.js')

contract('RIFScheduler - plans', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.rifScheduler = rifScheduler

    this.testAddPlan = async (price, window, gasLimit, token, account) => {
      const beforeCount = await this.rifScheduler.plansCount()
      const receipt = await this.rifScheduler.addPlan(price, window, gasLimit, token, { from: account })
      expectEvent(receipt, 'PlanAdded', {
        price: price,
        window: window,
        gasLimit: gasLimit,
        token: token,
      })
      const afterCount = await this.rifScheduler.plansCount()
      assert.strictEqual(beforeCount.add(toBN(1)).toString(), afterCount.toString(), `Count doesn't match`)
    }

    this.testRemovePlan = async (account) => {
      await this.testAddPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, account)
      const planActive = await this.rifScheduler.plans(0)
      assert.strictEqual(planActive.active, true, `The plan is not active`)
      await this.rifScheduler.removePlan(0, { from: account })
      const planInactive = await this.rifScheduler.plans(0)
      assert.strictEqual(planInactive.active, false, `Didn't cancel the plan`)
    }
  })

  it('initially has no plans', () => this.rifScheduler.plansCount().then((count) => assert.strictEqual(count.toString(), '0')))
  it('should add a plan', () =>
    this.testAddPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, this.serviceProvider))
  it('should add two plans', async () => {
    //payed with ERC-20 or 677
    await this.testAddPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, this.serviceProvider)
    //payed with rBTC
    await this.testAddPlan(plans[1].price, plans[1].window, plans[1].gasLimit, constants.ZERO_ADDRESS, this.serviceProvider)
  })

  it('should reject plans added by other users', () =>
    expectRevert(
      this.testAddPlan(plans[0].price, plans[0].window, plans[0].gasLimit, this.token.address, this.requestor),
      'Not authorized'
    ))

  it('should cancel a plan', () => this.testRemovePlan(this.serviceProvider))

  it("should reject to cancel a plan if it's not the provider", () => expectRevert(this.testRemovePlan(this.requestor), 'Not authorized'))

  it('should reject to cancel if the plan is not active', async () => {
    await this.testRemovePlan(this.serviceProvider)
    return expectRevert(this.rifScheduler.removePlan(0, { from: this.serviceProvider }), 'The plan is already inactive')
  })
})
