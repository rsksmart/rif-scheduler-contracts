const Counter = artifacts.require('Counter')
const assert = require('assert')
const { time } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils
const { plans, ExecutionState, setupContracts, getExecutionId, getMethodSig } = require('./common.js')

const incData = getMethodSig({ inputs: [], name: 'inc', type: 'function' })

contract('RIFScheduler - multicall', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider] = accounts

    const { token, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
    this.token = token
    this.rifScheduler = rifScheduler

    this.counter = await Counter.new()

    await this.rifScheduler.addPlan(plans[0].price, plans[0].window, this.token.address, { from: this.serviceProvider })
  })

  it('buy plan and schedule a new execution', async () => {
    const plan = 0
    const scheduleTime = (await time.latest()).add(toBN(100))
    const to = this.counter.address
    const gas = toBN(await this.counter.inc.estimateGas())
    await this.token.approve(this.rifScheduler.address, toBN(1000), { from: this.requestor })

    const purchaseCall = this.rifScheduler.contract.methods.purchase(plan, 1).encodeABI()
    const schedule = this.rifScheduler.contract.methods.schedule(plan, to, incData, gas, scheduleTime).encodeABI()
    const results = await this.rifScheduler.multicall([purchaseCall, schedule], { from: this.requestor })
    const executionId = getExecutionId(results)
    const actual = await this.rifScheduler.getExecutionById(executionId)
    const scheduled = await this.rifScheduler.remainingExecutions(this.requestor, plan)

    assert.strictEqual(actual[0], this.requestor, 'Not scheduled for this user')
    assert.strictEqual(actual[1].toString(), toBN(plan).toString(), 'Wrong plan')
    assert.strictEqual(actual[2], to, 'Wrong contract address')
    assert.strictEqual(actual[3], incData)
    assert.strictEqual(actual[4].toString(), gas.toString())
    assert.strictEqual(actual[5].toString(), scheduleTime.toString())
    assert.strictEqual(actual[6].toString(), '0')
    assert.strictEqual(actual[7].toString(), ExecutionState.Scheduled)
    assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
  })
})
