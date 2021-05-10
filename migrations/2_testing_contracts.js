const Counter = artifacts.require('Counter')

module.exports = async (deployer, network, accounts) => {
  if (network === 'develop') {
    deployer.deploy(Counter);
  }
};
