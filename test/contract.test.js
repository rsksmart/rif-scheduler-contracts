const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils
const assert = require('assert')
const { formatWithCursor } = require('prettier')

contract('OneShotSchedule', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.schedulingRequestor, this.serviceProvider, this.anotherAccount] = accounts
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
  })

  describe('constructor', () => {
    it('should reject if admin is not defined', () => 
      expectRevert(
        OneShotSchedule.new(this.token.address, constants.ZERO_ADDRESS, this.payee),
        "Service provider address cannot be 0x0")
    )
    it('should reject if provider is not defined', () => 
      expectRevert(
        OneShotSchedule.new(this.token.address, this.serviceProvider, constants.ZERO_ADDRESS),
        "Payee address cannot be 0x0")
    )
    it('should reject if token is not defined', () => 
      expectRevert(
        OneShotSchedule.new(constants.ZERO_ADDRESS, this.serviceProvider, this.payee),
        "Token address cannot be 0x0")
    )
  })
  describe('payee', () => {
    beforeEach(async () => {
      ;[this.contractAdmin, this.payee, this.schedulingRequestor, this.serviceProvider] = accounts
      this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
      this.oneShotSchedule = await OneShotSchedule.new(this.token.address, this.serviceProvider, this.payee)
    })
    it('should change the payee', async () => {
      this.oneShotSchedule.setPayee(this.anotherAccount, {from:this.serviceProvider})
      const newPayee = await this.oneShotSchedule.payee()
      assert.strictEqual(newPayee.toString(),this.anotherAccount,"New payee not assigned")
    })

    it('should not change the payee if not the service provider',  () => 
      expectRevert(
        this.oneShotSchedule.setPayee(this.anotherAccount, {from:this.anotherAccount}), //call from wrong account
        'Not authorized')
    )
    it('should not change the payee to 0x0',  () => 
      expectRevert(
        this.oneShotSchedule.setPayee(constants.ZERO_ADDRESS, {from:this.serviceProvider}), //call from wrong account
        "Payee address cannot be 0x0")
    )
  })
})
