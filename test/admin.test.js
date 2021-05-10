const OneShotSchedule = artifacts.require('OneShotSchedule')

const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const assert = require('assert')

const { setupContracts } = require('./common')

contract('OneShotSchedule - admin', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider, this.anotherAccount] = accounts
    this.oneShotSchedule = await OneShotSchedule.new()
  })

  describe('constructor', () => {
    it('should reject if admin is not defined', () =>
      expectRevert(this.oneShotSchedule.initialize(constants.ZERO_ADDRESS, this.payee), 'Service provider address cannot be 0x0'))
    it('should reject if provider is not defined', () =>
      expectRevert(this.oneShotSchedule.initialize(this.serviceProvider, constants.ZERO_ADDRESS), 'Payee address cannot be 0x0'))
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
