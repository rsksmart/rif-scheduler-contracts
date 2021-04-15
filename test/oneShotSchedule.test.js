const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')  // payment method
const Counter = artifacts.require('Counter')

const schedulingPrice = new web3.utils.BN(10)
const window = new web3.utils.BN(100000000)

const assert = require('assert')
const { hasUncaughtExceptionCaptureCallback } = require('process')

const getMethodSig = method => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')
const failData = getMethodSig('fail()')

const solidityError = message => ({
  message: `Returned error: VM Exception while processing transaction: revert ${message} -- Reason given: ${message}.`
})

contract('SchedulePaymentsLock', (accounts) => {
  beforeEach(async () => {
      this.token = await ERC677.new(accounts[0], web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF', web3.utils.toBN('18'));
      this.serviceProviderAccount = accounts[1]
      this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProviderAccount, schedulingPrice, window)
      
  })

  describe('payments', () => {
    beforeEach(async () => {
      this.counter = await Counter.new()
        this.testPurchaseWithValue = async (value) => {
          const valBN = new web3.utils.BN(value)
          await this.token.approve(this.oneShotSchedule.address, new web3.utils.BN(1000))
          await this.oneShotSchedule.purchase(valBN)
          const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])
          const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)
          
          assert.strictEqual(scheduled.toString(10), valBN.toString(10), `Didn't schedule ${value}`)
          assert.strictEqual(contractBalance.toString(10), (valBN * schedulingPrice).toString(), "Balance mismatch")
        }
    })

    // it('should receive RIF tokens to purchase a scheduling the plan ERC677 way', ()=>{
    //     //this.token.transferAndCall(this.oneShotSchedule.address,new web3.utils.BN(10), )
    //     // a user sends RIF tokens to the lock contract to buy schedulings (sendAndCall)
    //     // the schedulings corresponding to the amount sent should be credited
    // })

    it('should receive RIF tokens to purchase 1 scheduled - ERC20 way', async () => await this.testPurchaseWithValue(1))
    it('should receive RIF tokens to purchase 10 scheduled  - ERC20 way', async () => await this.testPurchaseWithValue(new web3.utils.BN(10)))

    // it('should reject if not approved', async () => assert.rejects(await this.testListingWithValue(new web3.utils.BN(1000000)), "Allowance Excedeed"))045


    // it('should return the plans/price', ()=>{  //(maybe not needed if public properties)
    //     // return plans/price   
    // })

  })

  describe('scheduling', () => {
    beforeEach(() => {
      this.testListingWithValue = async (value) => {
        const to = this.counter.address
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())
        const timestamp = new web3.utils.BN(Math.ceil(+Date.now() / 1000))

        await this.token.approve(this.oneShotSchedule.address, new web3.utils.BN(1000))
        await this.oneShotSchedule.purchase(1)
        await this.oneShotSchedule.schedule(to, incData, gas, timestamp, { value })
        const actual = await this.oneShotSchedule.getSchedule(0)
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])

        assert.strictEqual(actual[0], accounts[0], 'Not scheduled for this user')
        assert.strictEqual(actual[1], to, 'Worng contract address')
        assert.strictEqual(actual[2], incData)
        assert.strictEqual(actual[3].toString(), gas.toString())
        assert.strictEqual(actual[4].toString(), timestamp.toString())
        assert.strictEqual(actual[5].toString(), value.toString())
        assert.strictEqual(actual[6], false)

        assert.strictEqual(scheduled.toString(10), '0', `Shouldn't have any scheduling`)
      }
    })

    it('schedule a new metatransaction', () => this.testListingWithValue(new web3.utils.BN(0)))
    it('schedule a new metatransaction with value', () => this.testListingWithValue(new web3.utils.BN(1e15)))
  })

  // describe('consumption', () => {
  //   beforeEach(() => {

  //   })

  //   it('should consume schedulings on scheduler call', async ()=>{
  //       await this.token.approve(this.oneShotSchedule.address, new web3.utils.BN(100))
  //       await this.oneShotSchedule.purchase(new web3.utils.BN(10))
  //       await this.oneShotSchedule.spend(accounts[0])
  //       const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])
  //       assert.strictEqual(scheduled.toString(9),'9', "Didn't remain 9")

        // a scheduler contract asks for a scheduling consumption for a user
        // the schedulings available for that user should decrease   (return remaining?)
        // the schedulings pending for the service provider should increase (?)
    // })

  //   it('should reject invalid user consume calls', ()=>{
  //       // a scheduler contract asks for a scheduling consumption for an invalid user
  //       // the transaction is rejected
  //   })

  //   it('should reject consume calls for users without credit', ()=>{
  //       // a scheduler contract asks for a scheduling consumption for a user without credit
  //       // the transaction is rejected
  //   })
  // })

  // describe('tokens release', () => {
  //   beforeEach(() => {

  //   })

  //   it('should release RIF tokens upon execution', ()=>{
  //       // a scheduler contract asks for payemnt release 
  //       // this contract sends RIF tokens to the provider
  //       // the schedulings pending for the service provider should decrease (?)
  //   })

  //   it('should refund user', () => {

  //   })
  // })
})