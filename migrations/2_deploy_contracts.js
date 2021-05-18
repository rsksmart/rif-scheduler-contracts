const ERC677 = artifacts.require('ERC677')
const OneShotSchedule = artifacts.require('OneShotSchedule')
const Counter = artifacts.require('Counter')
const { deployProxy } = require('@openzeppelin/truffle-upgrades')
module.exports = async (deployer, network, accounts) => {
  const [contractAdmin, payee] = accounts

  if (network === 'develop') {
    await deployer.deploy(Counter)
    await deployer.deploy(ERC677, contractAdmin, web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    console.log('RIF Contract implementation: ' + ERC677.address)
  }

  if (network !== 'test' && network !== 'soliditycoverage') {
    await deployProxy(OneShotSchedule, [contractAdmin, payee], { deployer })
    console.log('OneShotSchedule Contract implementation: ' + OneShotSchedule.address)
  }
}