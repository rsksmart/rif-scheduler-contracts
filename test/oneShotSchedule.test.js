const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')  // payment method
const Counter = artifacts.require('Counter')

const assert = require('assert')
const { hasUncaughtExceptionCaptureCallback } = require('process')
const { time } = require('@openzeppelin/test-helpers');
const { takeSnapshot, revertToSnapshot } = require('./timeMachine.js');

const schedulingPrice = web3.utils.toBN(15)
const window = 10000
const insideWindow = window - 1000
const outisdeWindow = window + 1000

const getMethodSig = method => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')
const failData = getMethodSig('fail()')

const solidityError = message => ({
  message: `Returned error: VM Exception while processing transaction: revert ${message} -- Reason given: ${message}.`
})

let initialSnapshot = null 
takeSnapshot().then(id=>{ initialSnapshot = id})

contract('SchedulePaymentsLock', (accounts) => {
  beforeEach(async () => {
    await revertToSnapshot(initialSnapshot)
    this.token = await ERC677.new(accounts[0], web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF', web3.utils.toBN('18'));
    this.serviceProviderAccount = accounts[1]
    this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProviderAccount, schedulingPrice, web3.utils.toBN(window))
    this.counter = await Counter.new()
  })

  describe('payments', () => {
    beforeEach(async () => {
      this.testPurchaseWithValue = async (_value) => {
        const value = web3.utils.toBN(_value)
        await this.token.approve(this.oneShotSchedule.address, web3.utils.toBN(1000))
        await this.oneShotSchedule.purchase(value)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])
        const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)
        
        assert.strictEqual(scheduled.toString(10), value.toString(10), `Didn't schedule ${value}`)
        assert.strictEqual(contractBalance.toString(10), value.mul(schedulingPrice).toString(10), "Balance mismatch")
      }

      this.testERC677PurchaseWithValue = async (_schedulings, _totalToTransfer) => {
        const schedulings = web3.utils.toBN(_schedulings)
        const totalToTransfer = web3.utils.toBN(_totalToTransfer);
        const encodedData = web3.eth.abi.encodeParameter('uint256', schedulings.toString() );
        await this.token.transferAndCall(this.oneShotSchedule.address, totalToTransfer, encodedData)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])
        const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)
        
        assert.strictEqual(scheduled.toString(10), schedulings.toString(10), `Didn't schedule ${schedulings.toString(10)}`)
        assert.strictEqual(contractBalance.toString(10), (totalToTransfer).toString(), "Balance mismatch")
      }

    })

    it('should receive RIF tokens to purchase 1 scheduled -  ERC677 way', 
      async () =>await this.testERC677PurchaseWithValue(1, 1 * schedulingPrice))
    it('should receive RIF tokens to purchase 1 scheduled -  ERC677 way', 
      async () =>await this.testERC677PurchaseWithValue(10, 10 * schedulingPrice))

    it("should reject if payment doesn't match total amount'", 
      async () => await assert.rejects(this.testERC677PurchaseWithValue(10, schedulingPrice), "Transferred amount doens't match total purchase"))

    it('should receive RIF tokens to purchase 1 scheduled - ERC20 way', async () => await this.testPurchaseWithValue(1))
    it('should receive RIF tokens to purchase 10 scheduled  - ERC20 way', async () => await this.testPurchaseWithValue(web3.utils.toBN(10)))

    it('should reject if not approved', 
    () => assert.rejects( this.testPurchaseWithValue(web3.utils.toBN(1e15)), "Allowance Excedeed"))

  })

  describe('scheduling', () => {
    beforeEach( () => {
      this.testListingWithValue = async (value) => {
        const to = this.counter.address
        const gas = web3.utils.toBN(await this.counter.inc.estimateGas())
        const timestamp = await time.latest() + 100

        await this.token.approve(this.oneShotSchedule.address, web3.utils.toBN(1000))
        await this.oneShotSchedule.purchase(1)
        await this.oneShotSchedule.schedule(to, incData, gas, timestamp, { value })
        const actual = await this.oneShotSchedule.getSchedule(0)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])

        assert.strictEqual(actual[0], accounts[0], 'Not scheduled for this user')
        assert.strictEqual(actual[1], to, 'Wrong contract address')
        assert.strictEqual(actual[2], incData)
        assert.strictEqual(actual[3].toString(), gas.toString())
        assert.strictEqual(actual[4].toString(), timestamp.toString())
        assert.strictEqual(actual[5].toString(), value.toString())
        assert.strictEqual(actual[6], false)

        assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
      }
    })

    it('schedule a new metatransaction', () => this.testListingWithValue(web3.utils.toBN(0)))
    it('schedule a new metatransaction with value', () => this.testListingWithValue(web3.utils.toBN(1e15)))
  })

  describe('execution', async() => {
    beforeEach(async() => { 
      await this.token.approve(this.oneShotSchedule.address, web3.utils.toBN(1000))

      this.addAndExecuteWithTimes = async (value, scheduleTimestamp, executionTimestamp) => {
        const to = this.counter.address
        const gas = web3.utils.toBN(await this.counter.inc.estimateGas())
        await this.oneShotSchedule.purchase(1)
        await this.oneShotSchedule.schedule(to, incData, gas, scheduleTimestamp, { value })
        await time.increaseTo(executionTimestamp)
        await time.advanceBlock()
        await this.oneShotSchedule.execute(0)
      }
      
      this.testExecutionWithValue = async (value) => {
        await time.advanceBlock()
        const timestamp = await time.latest()
        await this.addAndExecuteWithTimes(value, timestamp.add(web3.utils.toBN(insideWindow)), timestamp.add(web3.utils.toBN(insideWindow))) //near future insid the window

        assert.ok(await this.oneShotSchedule.getSchedule(0).then(meta => meta[5]), 'Not ok')
        assert.strictEqual(await this.counter.count().then(r => r.toString()), '1', 'Counter difference')
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then(r => r.toString()), value.toString(), 'wrong balance')
      }
    })

    it('executes a listed a metatransaction', () => this.testExecutionWithValue(web3.utils.toBN(0)))
    it('executes a listed a metatransaction with value', () => this.testExecutionWithValue(web3.utils.toBN(1e15)))

    it('cannot execute twice', async () => {
      await this.testExecutionWithValue(web3.utils.toBN(0))
      await assert.rejects(
        this.oneShotSchedule.execute(0),
        solidityError('Already executed')
      )
    })

    it('cannot execute before timestamp - window', async () => {
      const timestamp = await time.latest()
      await assert.rejects(
        this.addAndExecuteWithTimes(web3.utils.toBN(0), 
          timestamp.add(web3.utils.toBN(60*60*24)),    // scheduled for tomorrow
          timestamp.add(web3.utils.toBN(60*60*24 - outisdeWindow))), // before window
        solidityError('Too soon')
      )
    })

    it('cannot execute after timestamp + window', async() => {
      const timestamp = await time.latest()
      await assert.rejects(
       this.addAndExecuteWithTimes(web3.utils.toBN(0), 
        timestamp.add(web3.utils.toBN(60*60*24)),    // scheduled for tomorrow
        timestamp.add(web3.utils.toBN(60*60*24 + outisdeWindow))), // after window
        solidityError('Too late')
      )
    })

    describe('failing metatransactions', () => {
      it('due to revert in called contract', async () => {
        const to = this.counter.address
        const gas = web3.utils.toBN(await this.counter.inc.estimateGas())
        const timestamp = await time.latest()
        await this.oneShotSchedule.purchase(1)
        await this.oneShotSchedule.schedule(to, failData, gas, timestamp)
        const tx = await this.oneShotSchedule.execute(0)
        const log = tx.logs.find(l => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(Buffer.from(log.args.result.slice(2), 'hex').toString('utf-8').includes('Boom'))
        assert.ok(await this.oneShotSchedule.getSchedule(0).then(meta => meta[5]))
      })

      it('due to insufficient gas in called contract', async () => {
        const to = this.counter.address
        const gas = web3.utils.toBN(10)
        const timestamp = await time.latest()
        await this.oneShotSchedule.purchase(1)
        await this.oneShotSchedule.schedule(to, failData, gas, timestamp)
        const tx = await this.oneShotSchedule.execute(0)
        const log = tx.logs.find(l => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(await this.oneShotSchedule.getSchedule(0).then(meta => meta[5]))
      })
    })
  })
})
