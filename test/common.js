const OneShotSchedule = artifacts.require('OneShotSchedule')
const ERC677 = artifacts.require('ERC677')

const { toBN } = web3.utils
const { time } = require('@openzeppelin/test-helpers')

const plans = [
  { price: toBN(15), window: toBN(10000) },
  { price: toBN(4), window: toBN(300) },
];

exports.MetaTransactionState = {
  Scheduled:'0',
  ExecutionSuccessful:'1',
  ExecutionFailed:'2',
  Overdue:'3',
  Refunded: '4',
  Cancelled:'5'
}

exports.setupContracts = async (contractAdmin, serviceProvider, payee, requestor) => {
  const token = await ERC677.new(contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
  const token2 = await ERC677.new(contractAdmin, toBN('1000000000000000000000'), 'RDOC', 'DOC')
  const oneShotSchedule = await OneShotSchedule.new(serviceProvider, payee)

  await token.transfer(requestor, 100000, { from: contractAdmin })
  await token2.transfer(requestor, 100000, { from: contractAdmin })
  
  return { token, token2, oneShotSchedule }
}

exports.insideWindow = (plan) => plans[plan].window.sub(toBN(1000))
exports.outsideWindow = (plan) => plans[plan].window.add(toBN(1000))

exports.plans = plans