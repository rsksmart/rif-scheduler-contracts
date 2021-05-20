const Migrations = artifacts.require('Migrations')

module.exports = function (deployer, network) {
  if (network !== 'rskTestnet' && network !== 'rskMainnet') deployer.deploy(Migrations)
}
