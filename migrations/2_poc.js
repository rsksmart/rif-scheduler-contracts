const Counter = artifacts.require('Counter')
const OneShotSchedule = artifacts.require('OneShotSchedule')


module.exports = function (deployer) {
  deployer.deploy(Counter);
  // deployer.deploy(OneShotSchedule, 100000000);
};
