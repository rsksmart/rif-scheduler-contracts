const RIFScheduler = artifacts.require('RIFScheduler')
const ERC677 = artifacts.require('ERC677')

const { toBN } = web3.utils

const plans = [
  { price: toBN(15), window: toBN(10000), gasLimit: toBN(200000) },
  { price: toBN(4), window: toBN(3000), gasLimit: toBN(100000) },
  { price: toBN(15), window: toBN(10000), gasLimit: toBN(10) }, //no gas plan use to make it fail
]

exports.ExecutionState = {
  Nonexistent: '0',
  Scheduled: '1',
  ExecutionSuccessful: '2',
  ExecutionFailed: '3',
  Overdue: '4',
  Refunded: '5',
  Cancelled: '6',
}

exports.setupContracts = async (contractAdmin, serviceProvider, payee, requestor) => {
  const token = await ERC677.new(contractAdmin, toBN('1000000000000000000000'), 'RIFOS', 'RIF')
  const token2 = await ERC677.new(contractAdmin, toBN('1000000000000000000000'), 'RDOC', 'DOC')
  const rifScheduler = await RIFScheduler.new(serviceProvider, payee, toBN(60))

  await token.transfer(requestor, 100000, { from: contractAdmin })
  await token2.transfer(requestor, 100000, { from: contractAdmin })

  return { token, token2, rifScheduler }
}

exports.insideWindow = (plan) => plans[plan].window.sub(toBN(1000))
exports.outsideWindow = (plan) => plans[plan].window.add(toBN(1000))

exports.getExecutionId = (tx) => {
  const log = tx.receipt.logs.find((l) => l.event === 'ExecutionRequested')
  return log.args.id
}

exports.getMultipleExecutionId = (tx) => {
  const logs = tx.receipt.logs.filter((l) => l.event === 'ExecutionRequested')
  return logs.map((l) => l.args.id)
}

exports.getMethodSig = (methodAbi, params = []) => web3.eth.abi.encodeFunctionCall(methodAbi, params)

exports.plans = plans
