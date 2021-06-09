const OneShotSchedule = artifacts.require('OneShotSchedule')

const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const assert = require('assert')

const { setupContracts } = require('./common')

contract('OneShotSchedule - admin', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider, this.anotherAccount] = accounts
  })

  describe('constructor', () => {
    it('should reject if admin is not defined', () =>
      expectRevert(OneShotSchedule.new(constants.ZERO_ADDRESS, this.payee), 'Service provider address cannot be 0x0'))
    it('should reject if provider is not defined', () =>
      expectRevert(OneShotSchedule.new(this.serviceProvider, constants.ZERO_ADDRESS), 'Payee address cannot be 0x0'))
  })
  
  describe.skip('Cancel All', () => {
    beforeEach(async () => {
      const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
      this.oneShotSchedule = oneShotSchedule
      // add balance to users
      
      // add plans:
      // - erc677
      // - erc20
      // -rbtc

      this.buyPlans = ()=>{}

    })
    it('should reject if not admin', () =>
      expectRevert('', 'Not authorized'))
    it('should reject if not paused', () =>
      expectRevert('', "Pausable: not paused"))
    it('should cancel all pending plans', () => {


      // expect planCount = 3
      // add executions from different users
      // user1 purchase many of each
      // user2 purchase 0,1,2
      // expect remaining executions to match
      // advance time and execute some
      // expect remaining executions to match
      // cancelAll
      // expect remaining executions to be 0
      // expect tokens total initial balances (users + sp) to equal final balances
      // expect rbtc total initial balances (users + sp) to equal final balances + gas used
      // expect contract balance to be 0 (for rbtc and all tokens)
      console.log('done')
    })
    
  })

  describe('payee', () => {
    beforeEach(async () => {
      const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
      this.token = token
      this.oneShotSchedule = oneShotSchedule
    })

    it('should change the payee', async () => {
      await this.oneShotSchedule.setPayee(this.anotherAccount, { from: this.serviceProvider })
      const newPayee = await this.oneShotSchedule.payee()
      assert.strictEqual(newPayee.toString(), this.anotherAccount, 'New payee not assigned')
      // put it back
      await this.oneShotSchedule.setPayee(this.payee, { from: this.serviceProvider })
      const revertedPayee = await this.oneShotSchedule.payee()
      assert.strictEqual(revertedPayee.toString(), this.payee, 'New payee change not reverted')
    })

    it('should not change the payee if not the service provider', () =>
      expectRevert(
        this.oneShotSchedule.setPayee(this.anotherAccount, { from: this.anotherAccount }), //call from wrong account
        'Not authorized'
      ))

    it('should not change the payee to 0x0', () =>
      expectRevert(
        this.oneShotSchedule.setPayee(constants.ZERO_ADDRESS, { from: this.serviceProvider }), //call from wrong account
        'Payee address cannot be 0x0'
      ))
  })
})
