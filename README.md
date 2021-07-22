<p align="middle">
    <img src="https://www.rifos.org/assets/img/logo.svg" alt="logo" height="100" >
</p>
<h3 align="middle"><code>@rsksmart/rif-scheduler-contracts</code></h3>
<p align="middle">
    <a href="https://badge.fury.io/js/%40rsksmart%2Frif-scheduler-contracts">
        <img src="https://badge.fury.io/js/%40rsksmart%2Frif-scheduler-contracts.svg" alt="npm" />
    </a>
    <a href="https://developers.rsk.co/rif/scheduler/contracts">
        <img src="https://img.shields.io/badge/-docs-brightgreen" alt="docs" />
    </a>
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml/badge.svg" alt="ci" />
    </a>
    <a href='https://coveralls.io/github/rsksmart/rif-scheduler-contracts?branch=main'>
        <img src='https://coveralls.io/repos/github/rsksmart/rif-scheduler-contracts/badge.svg?branch=develop' alt='Coverage Status' />
    </a>
    <br />
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml/badge.svg" alt="ci" />
    </a>
    <a href="https://lgtm.com/projects/g/rsksmart/rif-scheduler-contracts/alerts/">
        <img src="https://img.shields.io/lgtm/alerts/github/rsksmart/rif-scheduler-contracts" alt="alerts">
    </a>
    <a href="https://lgtm.com/projects/g/rsksmart/rif-scheduler-contracts/context:javascript">
        <img src="https://img.shields.io/lgtm/grade/javascript/github/rsksmart/rif-scheduler-contracts">
    </a>
</p>

RIF Scheduler smart contracts are used to
- purchase execution plans with ERC-20 tokens or RBTC,
- schedule executions, (batch scheduling available)
- check execution statuses and
- cancel executions

The Service Provider must deploy this contract and set the address in the [RIF Scheduler Service](https://github.com/rsksmart/rif-scheduler-services) to start making revenue. The SP can:
- Create plans and choose the payment currency. It can be RBTC. Plans have a price per execution, that is given by the _window_ and the _gas limit_.
- Execute the scheduled executions and collect the reward. It can also change the payee address.
- Pause/unpause the contract. While paused, users can _cancel purchasing_.

## Run for development

Install dependencies:

```sh
npm i
```

### Run unit tests

```sh
npm test
```

Coverage report with:

```sh
npm run coverage
```

### Run linter

```sh
npm run lint
```

Auto-fix:

```sh
npm run lint:fix
```

### Static analysis

First install [`slither`](https://github.com/crytic/slither) and run:

```sh
slither .
```

### Branching model

- `main` has latest release. Merge into `main` will deploy to npm. Do merge commits.
- `develop` has latest approved PR. PRs need to pass `ci` and `scan`. Do squash & merge.
- Use branches pointing to `develop` to add new PRs.
- Do external PRs against latest commit in `develop`.

### Deploy

First, create a `.secret` file with a mnemonic phrase. You will need to fund the account. Then run:

```sh
npm run deploy:ganache # deploy to :8545
npm run deploy:rsk-testnet # deploy to RSK Testnet
npm run deploy:rsk-mainnet # deploy to RSK Mainnet
```

## Deployments

RIF is running an instance of the Scheduler.

**RSK Testnet:** [`0xad249557515d8b89f2869834857bb872d7b5c398`](https://explorer.testnet.rsk.co/address/0xad249557515d8b89f2869834857bb872d7b5c398)

**RSK Mainnet:** [`TBD`](https://explorer.testnet.rsk.co/address/TBD)

## Acknowledgments

Scheduled transaction times are not exact, they will be performed inside an execution window depending on the plan.
The contract also uses `block.timestamp` to stablish if the scheduled transaction should be executed and/or refunded,
which is subject to manipulation for short time periods.
