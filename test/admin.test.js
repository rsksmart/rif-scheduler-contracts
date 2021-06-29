const RIFScheduler = artifacts.require('RIFScheduler')

const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const assert = require('assert')

const { setupContracts } = require('./common')
const { toBN } = web3.utils

contract('RIFScheduler - admin', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.requestor, this.serviceProvider, this.anotherAccount] = accounts
  })

  describe('constructor', () => {
    it('should reject if admin is not defined', () =>
      expectRevert(RIFScheduler.new(constants.ZERO_ADDRESS, this.payee, toBN(1000)), 'Service provider address cannot be 0x0'))
    
    it('should reject if provider is not defined', () =>
      expectRevert(RIFScheduler.new(this.serviceProvider, constants.ZERO_ADDRESS, toBN(1000)), 'Payee address cannot be 0x0'))
    
    it('should reject if minimun time before execution is lower than 15 seconds', () =>
      expectRevert(RIFScheduler.new(this.serviceProvider, this.payee, toBN(10)), 'Executions should be requested at least 15 seconds in advance'))
  })

  describe('Pausable', () => {
    beforeEach(async () => {
      const { token, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
      this.rifScheduler = rifScheduler
    })

    it('should pause the contract', async () => {
      await this.rifScheduler.pause({ from: this.serviceProvider })
      assert.ok(await this.rifScheduler.paused(), 'Not paused')
    })

    it('should not pause the contract, if not the service provider', async () =>
      expectRevert(this.rifScheduler.pause({ from: this.requestor }), 'Not authorized'))

    it('should unpause the contract', async () => {
      await this.rifScheduler.pause({ from: this.serviceProvider })
      await this.rifScheduler.unpause({ from: this.serviceProvider })
      assert.ok(!(await this.rifScheduler.paused()), 'Not unpaused')
    })

    it('should not pause the contract, if not the service provider', async () => {
      await this.rifScheduler.pause({ from: this.serviceProvider })
      return expectRevert(this.rifScheduler.unpause({ from: this.requestor }), 'Not authorized')
    })
  })

  describe('payee', () => {
    beforeEach(async () => {
      const { token, rifScheduler } = await setupContracts(this.contractAdmin, this.serviceProvider, this.payee, this.requestor)
      this.token = token
      this.rifScheduler = rifScheduler
    })

    it('should change the payee', async () => {
      await this.rifScheduler.setPayee(this.anotherAccount, { from: this.serviceProvider })
      const newPayee = await this.rifScheduler.payee()
      assert.strictEqual(newPayee.toString(), this.anotherAccount, 'New payee not assigned')
      // put it back
      await this.rifScheduler.setPayee(this.payee, { from: this.serviceProvider })
      const revertedPayee = await this.rifScheduler.payee()
      assert.strictEqual(revertedPayee.toString(), this.payee, 'New payee change not reverted')
    })

    it('should not change the payee if not the service provider', () =>
      expectRevert(
        this.rifScheduler.setPayee(this.anotherAccount, { from: this.anotherAccount }), //call from wrong account
        'Not authorized'
      ))

    it('should not change the payee to 0x0', () =>
      expectRevert(
        this.rifScheduler.setPayee(constants.ZERO_ADDRESS, { from: this.serviceProvider }), //call from wrong account
        'Payee address cannot be 0x0'
      ))
  })
})
