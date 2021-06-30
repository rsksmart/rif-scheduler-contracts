const ERC677 = artifacts.require('ERC677')
const RIFScheduler = artifacts.require('RIFScheduler')
const Counter = artifacts.require('Counter')
module.exports = async (deployer, network, accounts) => {
  const [contractAdmin, payee] = accounts

  if (network === 'develop') {
    await deployer.deploy(Counter)
    await deployer.deploy(ERC677, contractAdmin, web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    console.log('RIF Contract implementation: ' + ERC677.address)
  }

  if (network !== 'test' && network !== 'soliditycoverage') {
    await deployer.deploy(RIFScheduler, contractAdmin, payee)
    console.log('RIFScheduler Contract implementation: ' + RIFScheduler.address)
  }

  if (network === 'rskTestnet') {
    await RIFScheduler.deployed().then((rifScheduler) =>
      rifScheduler.addPlan('10000000000000', '7200', '100000', '0x19f64674d8a5b4e652319f5e239efd3bc969a1fe')
    )
  }

  if (network === 'ganache') {
    const devAccount = 'YOUR_ACCOUNT'
    await web3.eth.sendTransaction({ from: accounts[0], to: devAccount, value: '1000000000000000000' })
    await deployer.deploy(ERC677, devAccount, web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    await RIFScheduler.deployed().then((rifScheduler) => rifScheduler.addPlan('1000000000000000000', '300', '100000', ERC677.address))
  }

  if (network === 'develop' || network === 'ganache') {
    await deployer.deploy(Counter)

    console.log('Summary')
    console.log('=======')
    console.log('')
    console.log(`Schedule: ${RIFSchedule.address}`)
    console.log(`Token: ${ERC677.address}`)
    console.log(`Counter: ${Counter.address}`)
  }
}
