const Counter = artifacts.require('Counter')

module.exports = async (deployer, network, accounts) => {
  if (network === 'develop' || network === 'ganache') {
    deployer.deploy(Counter)
  }
}
