<p align="middle">
    <img src="https://www.rifos.org/assets/img/logo.svg" alt="logo" height="100" >
</p>
<h3 align="middle">RIF Scheduler contracts POC</h3>
<p align="middle">
    A POC of RIF scheduler smart contracts
</p>

## Run locally

First of all, install the dependencies

```
npm i
```

### Run tests

```
npm test
```

### Run in local network

```
npx truffle develop
truffle(develop)> migrate
```

### Deploy on RSK Testnet

First create a `.secret` file with a mnemonic phrase. You can create one here https://iancoleman.io/bip39/ (do not use this on production)

Then run

```
npx truffle console --network rskTestnet
truffle(rskTestnet)> migrate
```

## Contracts

### Forwarder

Forwards transactions that are stored in a list

RSK Testnet: [`0x9F24a0BDbAa5DBA945829C7AeEfAF4D1cEf8158f`](https://explorer.testnet.rsk.co/address/0x9f24a0bdbaa5dba945829c7aeefaf4d1cef8158f)

```solidity
function add(address to, bytes memory data, uint gas) public payable
```

Use `add` to add a transaction to the list. It will emit an event with the index in the array. Add `value` to the transaction, to forward it in the execution.

```solidity
function at(uint index) public view returns(address, bytes memory, uint, uint, bool)
```

Use `at` to query the status of a transaction. It will return if it was executed or not, together with the set values.

```solidity
function execute(uint index) public
```

Executes a transaction of the list that was not executed before. It will emit an event with the result or revert if the forwarding fails.


### Counter

A dummy counter to test calls from `Forwarder`

RSK Testnet: [`0x3f21Ab1ADd7f85aa7bf479c64C0c603183e8A7A2`](https://explorer.testnet.rsk.co/address/0x3f21ab1add7f85aa7bf479c64c0c603183e8a7a2)

```solidity
uint public count
```

Get the current count

```solidity
function inc() public payable
```

Increment the count. Also use this for testing the value forwarding.
