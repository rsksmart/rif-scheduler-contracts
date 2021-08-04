const ERC677 = artifacts.require('ERC677')
const RIFScheduler = artifacts.require('RIFScheduler')
const Counter = artifacts.require('Counter')

const RIF_TOKEN_MAINNET = '0x2acc95758f8b5f583470ba265eb685a8f45fc9d5'
const logTxHash = (truffleTx) => console.log(truffleTx.tx)

module.exports = async (deployer, network, accounts) => {
  const [contractAdmin, payee] = accounts

  if (network === 'develop') {
    await deployer.deploy(Counter)
    await deployer.deploy(ERC677, contractAdmin, web3.utils.toBN('1000000000000000000000'), 'RIFOS', 'RIF')
    console.log('RIF Contract implementation: ' + ERC677.address)
  }

  if (network !== 'test' && network !== 'soliditycoverage' && network !== 'rskMainnet') {
    await deployer.deploy(RIFScheduler, contractAdmin, payee, 60)
    console.log('RIFScheduler Contract implementation: ' + RIFScheduler.address)
  }

  if (network === 'rskTestnet') {
    await RIFScheduler.deployed().then((rifScheduler) =>
      rifScheduler.addPlan('10000000000000', '7200', '100000', '0x19f64674d8a5b4e652319f5e239efd3bc969a1fe')
    )
  }

  if (network === 'rskMainnet') {
    await deployer.deploy(RIFScheduler, accounts[0], accounts[0], 60)
    const rifScheduler = await RIFScheduler.deployed()
    await rifScheduler.addPlan('10000000000000000000', '1800', '200000', RIF_TOKEN_MAINNET).then(logTxHash)
    await rifScheduler.addPlan('24000000000000000000', '1800', '500000', RIF_TOKEN_MAINNET).then(logTxHash)
    await rifScheduler.addPlan('38000000000000000000', '600', '800000', RIF_TOKEN_MAINNET).then(logTxHash)
    await rifScheduler.addPlan('47000000000000000000', '600', '1100000', RIF_TOKEN_MAINNET).then(logTxHash)
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
    console.log(`Schedule: ${RIFScheduler.address}`)
    console.log(`Token: ${ERC677.address}`)
    console.log(`Counter: ${Counter.address}`)
  }
}
