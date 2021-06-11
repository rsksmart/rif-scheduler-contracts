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

  describe('Pausable', () => {
    beforeEach(async () => {
      const { token, oneShotSchedule } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
      this.oneShotSchedule = oneShotSchedule
    })

    it('should pause the contract', async () => {
      await this.oneShotSchedule.pause({ from: this.serviceProvider })
      assert.ok(await this.oneShotSchedule.paused(), 'Not paused')
    })

    it('should not pause the contract, if not the service provider', async () =>
      expectRevert(this.oneShotSchedule.pause({ from: this.requestor }), 'Not authorized'))

    it('should unpause the contract', async () => {
      await this.oneShotSchedule.pause({ from: this.serviceProvider })
      await this.oneShotSchedule.unpause({ from: this.serviceProvider })
      assert.ok(!(await this.oneShotSchedule.paused()), 'Not unpaused')
    })

    it('should not pause the contract, if not the service provider', async () => {
      await this.oneShotSchedule.pause({ from: this.serviceProvider })
      return expectRevert(this.oneShotSchedule.unpause({ from: this.requestor }), 'Not authorized')
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
