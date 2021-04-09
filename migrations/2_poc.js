const Counter = artifacts.require('Counter')
const Forwarder = artifacts.require('Forwarder')


module.exports = function (deployer) {
  deployer.deploy(Counter);
  deployer.deploy(Forwarder);
};
