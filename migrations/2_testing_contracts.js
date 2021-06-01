const Counter = artifacts.require('Counter')
const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

module.exports = async (deployer, network, accounts) => {
  if (network === 'develop' || network === 'ganache') {
    await deployer.deploy(Counter)

    console.log('Summary')
    console.log('=======')
    console.log('')
    console.log(`Schedule: ${OneShotSchedule.address}`)
    console.log(`Token: ${ERC677.address}`)
    console.log(`Counter: ${Counter.address}`)
  }
}
