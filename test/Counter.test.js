const Counter = artifacts.require('Counter')

const assert = require('assert')
const { time, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

contract('Counter', (accounts) => {
  beforeEach(async () => {
    this.counter = await Counter.new()
  })

  describe('scheduling', () => {
    it('expect counter fail', () => expectRevert(this.counter.fail(), 'Boom'))
  })
})
