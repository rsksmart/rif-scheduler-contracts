const Counter = artifacts.require('Counter')
const Forwarder = artifacts.require('Forwarder')

const assert = require('assert')

const incData = web3.utils.sha3('inc()').slice(0, 10)

contract('Forwarder', () => {
  beforeEach(async () => {
    this.counter = await Counter.new()
    this.forwarder = await Forwarder.new()
  })

  describe('listing', () => {
    beforeEach(() => {
      this.testListingWithValue = async (value) => {
        const to = this.counter.address
        const data = web3.utils.sha3('inc()').slice(0, 10)
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())

        await this.forwarder.add(to, data, gas, { value })

        const actual = await this.forwarder.at(0)

        assert.strictEqual(actual[0], to)
        assert.strictEqual(actual[1], data)
        assert.strictEqual(actual[2].toString(), gas.toString())
        assert.strictEqual(actual[3].toString(), value.toString())
        assert.strictEqual(actual[4], false)
      }
    })

    it('lists a new metatransaction', () => this.testListingWithValue(new web3.utils.BN(0)))
    it('lists a new metatransaction with value', () => this.testListingWithValue(new web3.utils.BN(1e15)))
  })

  describe('execution', () => {
    beforeEach(() => {
      this.testExecutionWithValue = async (value) => {
        const to = this.counter.address
        const data = web3.utils.sha3('inc()').slice(0, 10)
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())

        await this.forwarder.add(to, data, gas, { value })

        await this.forwarder.execute(0)

        assert.strictEqual(await this.forwarder.at(0).then(meta => meta[4]), true)
        assert.strictEqual(await this.counter.count().then(r => r.toString()), '1')
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then(r => r.toString()), value.toString())
      }
    })

    it('executes a listed a metatransaction', () => this.testExecutionWithValue(new web3.utils.BN(0)))
    it('executes a listed a metatransaction with value', () => this.testExecutionWithValue(new web3.utils.BN(1e15)))
  })
})
