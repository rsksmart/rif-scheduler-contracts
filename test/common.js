const { toBN } = web3.utils

const plans = [
    { price: toBN(15), window: toBN(10000) },
    { price: toBN(4), window: toBN(300) },
  ]

exports.plans = plans