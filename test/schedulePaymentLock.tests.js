const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')  // payment method
const schedulingPrice = new web3.utils.BN(10)
const window = new web3.utils.BN(100000000)

const assert = require('assert')
const { hasUncaughtExceptionCaptureCallback } = require('process')

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
    beforeEach(() => {

    })

    it('should receive RIF tokens to purchase a scheduling the plan ERC677 way', ()=>{
        //this.token.transferAndCall(this.oneShotSchedule.address,new web3.utils.BN(10), )
        // a user sends RIF tokens to the lock contract to buy schedulings (sendAndCall)
        // the schedulings corresponding to the amount sent should be credited
    })

    it('should receive RIF tokens to purchase a scheduling the plan - ERC20 way', async() => {
        await this.token.approve(this.oneShotSchedule.address, new web3.utils.BN(100))
        await this.oneShotSchedule.purchase(new web3.utils.BN(10))
        const scheduled = await this.oneShotSchedule.getRemainingSchedulings(accounts[0])
        assert.strictEqual(scheduled.toString(10),'10', "Didn't schedule 10")

        const contractBalance = await this.token.balanceOf(this.oneShotSchedule.address)
        assert.strictEqual(contractBalance.toString(10),'100', "Balance mismatch")
    })

    it('should reject payments that do not match plans', () => {
        // to this contract
        // a user sends an invalid amoiunt of RIF tokens to the lock contract to buy schedulings
        // it should reject the tx
    })

    it('should return the plans/price', ()=>{  //(maybe not needed if public properties)
        // return plans/price   
    })

  })

  describe('consumption', () => {
    beforeEach(() => {

    })

    it('should consume schedulings on scheduler call', ()=>{
        // a scheduler contract asks for a scheduling consumption for a user
        // the schedulings available for that user should decrease   (return remaining?)
        // the schedulings pending for the service provider should increase (?)
    })

    it('should reject invalid user consume calls', ()=>{
        // a scheduler contract asks for a scheduling consumption for an invalid user
        // the transaction is rejected
    })

    it('should reject consume calls for users without credit', ()=>{
        // a scheduler contract asks for a scheduling consumption for a user without credit
        // the transaction is rejected
    })
  })

  describe('tokens release', () => {
    beforeEach(() => {

    })

    it('should release RIF tokens upon execution', ()=>{
        // a scheduler contract asks for payemnt release 
        // this contract sends RIF tokens to the provider
        // the schedulings pending for the service provider should decrease (?)
    })

    it('should refund user', () => {

    })
  })
})