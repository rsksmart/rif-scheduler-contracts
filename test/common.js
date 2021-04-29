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

exports.plans = plans;
exports.MetaTransactionState = MetaTransactionState;