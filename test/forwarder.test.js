const Counter = artifacts.require('Counter')
const Forwarder = artifacts.require('Forwarder')

const assert = require('assert')

const getMethodSig = method => web3.utils.sha3(method).slice(0, 10)
const incData = getMethodSig('inc()')
const failData = getMethodSig('fail()')
const window = 1800

const solidityError = message => ({
  message: `Returned error: VM Exception while processing transaction: revert ${message} -- Reason given: ${message}.`
})

contract('Forwarder', () => {
  beforeEach(async () => {
    this.counter = await Counter.new()
    this.forwarder = await Forwarder.new(window)
  })

  describe('scheduling', () => {
    beforeEach(() => {
      this.testListingWithValue = async (value) => {
        const to = this.counter.address
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())
        const timestamp = new web3.utils.BN(Math.ceil(+Date.now() / 1000))

        await this.forwarder.schedule(to, incData, gas, timestamp, { value })

        const actual = await this.forwarder.getSchedule(0)

        assert.strictEqual(actual[0], to)
        assert.strictEqual(actual[1], incData)
        assert.strictEqual(actual[2].toString(), gas.toString())
        assert.strictEqual(actual[3].toString(), timestamp.toString())
        assert.strictEqual(actual[4].toString(), value.toString())
        assert.strictEqual(actual[5], false)
      }
    })

    it('schedule a new metatransaction', () => this.testListingWithValue(new web3.utils.BN(0)))
    it('schedule a new metatransaction with value', () => this.testListingWithValue(new web3.utils.BN(1e15)))
  })

  describe('execution', () => {
    beforeEach(() => {
      this.addAndExecuteWithTimestamp = async (value, timestamp) => {
        const to = this.counter.address
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())

        await this.forwarder.schedule(to, incData, gas, timestamp, { value })

        await this.forwarder.execute(0)
      }

      this.testExecutionWithValue = async (value) => {
        await this.addAndExecuteWithTimestamp(value, new web3.utils.BN(Math.ceil(+Date.now() / 1000)))

        assert.ok(await this.forwarder.getSchedule(0).then(meta => meta[5]))
        assert.strictEqual(await this.counter.count().then(r => r.toString()), '1')
        assert.strictEqual(await web3.eth.getBalance(this.counter.address).then(r => r.toString()), value.toString())
      }
    })

    it('executes a listed a metatransaction', () => this.testExecutionWithValue(new web3.utils.BN(0)))
    it('executes a listed a metatransaction with value', () => this.testExecutionWithValue(new web3.utils.BN(1e15)))

    it('cannot execute twice', async () => {
      await this.testExecutionWithValue(new web3.utils.BN(0))
      await assert.rejects(
        this.forwarder.execute(0),
        solidityError('Already executed')
      )
    })

    it('cannot execute before timestamp - window', () => assert.rejects(
        this.addAndExecuteWithTimestamp(0, new web3.utils.BN(Math.ceil(+Date.now() / 1000) + window + 3000)),
        solidityError('Too soon')
      )
    )

    it('cannot execute after timestamp + window', () => assert.rejects(
        this.addAndExecuteWithTimestamp(0, new web3.utils.BN(Math.ceil(+Date.now() / 1000) - window - 3000)),
        solidityError('Too late')
      )
    )

    describe('failing metatransactions', () => {
      it('due to revert in called contract', async () => {
        const to = this.counter.address
        const gas = new web3.utils.BN(await this.counter.inc.estimateGas())
        const timestamp = new web3.utils.BN(Math.ceil(+Date.now() / 1000))

        await this.forwarder.schedule(to, failData, gas, timestamp)

        const tx = await this.forwarder.execute(0)
        const log = tx.logs.find(l => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(Buffer.from(log.args.result.slice(2), 'hex').toString('utf-8').includes('Boom'))
        assert.ok(await this.forwarder.getSchedule(0).then(meta => meta[5]))
      })

      it('due to insufficient gas in called contract', async () => {
        const to = this.counter.address
        const gas = new web3.utils.BN(10)
        const timestamp = new web3.utils.BN(Math.ceil(+Date.now() / 1000))

        await this.forwarder.schedule(to, failData, gas, timestamp)

        const tx = await this.forwarder.execute(0)
        const log = tx.logs.find(l => l.event === 'MetatransactionExecuted')
        assert.ok(!log.args.success)
        assert.ok(await this.forwarder.getSchedule(0).then(meta => meta[5]))
      })
    })
  })
})
