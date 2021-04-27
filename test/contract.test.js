const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

const { expectRevert, constants } = require('@openzeppelin/test-helpers')
const { toBN } = web3.utils

contract('OneShotSchedule', (accounts) => {
  beforeEach(async () => {
    ;[this.contractAdmin, this.payee, this.schedulingRequestor, this.serviceProvider] = accounts
    this.token = await ERC677.new(this.contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
  })

  describe('constructor', () => {
    it('should reject if the token is not defined', () => 
    expectRevert(
      OneShotSchedule.new(constants.ZERO_ADDRESS, this.serviceProvider, this.payee),
      'Token address cannot be 0x0')
    )
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
  })
})
