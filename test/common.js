const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

const { toBN } = web3.utils

const plans = [
  { price: toBN(15), window: toBN(10000) },
  { price: toBN(4), window: toBN(300) },
];

const MetaTransactionState = {
  Scheduled:'0',
  ExecutionSuccessful:'1',
  ExecutionFailed:'2',
  Overdue:'3',
  Refunded: '4',
  Cancelled:'5'
}

const setupContracts = async (contractAdmin, serviceProvider, payee, requestor) => {
  const token = await ERC677.new(contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
  const oneShotSchedule = await OneShotSchedule.new(serviceProvider, payee)

  await token.transfer(requestor, 100000, { from: contractAdmin })

  return { token, oneShotSchedule }
}

exports.plans = plans;
exports.MetaTransactionState = MetaTransactionState;
exports.setupContracts = setupContracts;
