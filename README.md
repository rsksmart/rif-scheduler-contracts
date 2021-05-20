<p align="middle">
    <img src="https://www.rifos.org/assets/img/logo.svg" alt="logo" height="100" >
</p>
<h3 align="middle">RIF Scheduler contracts</h3>
<p align="middle">
    <a href="https://developers.rsk.co/rif/scheduler/contracts">
        <img src="https://img.shields.io/badge/-docs-brightgreen" alt="docs" />
    </a>
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml/badge.svg" alt="ci" />
    </a>
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml/badge.svg" alt="ci" />
    </a>
    <a href="https://lgtm.com/projects/g/rsksmart/rif-scheduler-contracts/alerts/">
        <img src="https://img.shields.io/lgtm/alerts/github/rsksmart/rif-scheduler-contracts" alt="alerts">
    </a>
    <a href="https://lgtm.com/projects/g/rsksmart/rif-scheduler-contracts/context:javascript">
        <img src="https://img.shields.io/lgtm/grade/javascript/github/rsksmart/rif-scheduler-contracts">
    </a>
    <a href="https://codecov.io/gh/rsksmart/rif-scheduler-contracts">
        <img src="https://codecov.io/gh/rsksmart/rif-scheduler-contracts/branch/develop/graph/badge.svg?token=72T5TQ34HT"/>
    </a>
</p>

RIF Scheduler smart contracts are used to
- pay for the service with RIF tokens,
- schedule transactions,
- check transaction execution statuses and
- allow the service provider to execute the transactions and collect their reward

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

### Deploy

First, create a `.secret` file with a mnemonic phrase. You will need to fund the account. Then run:

```sh
npm run deploy:ganache # deploy to :8545
npm run deploy:rsk-testnet # deploy to RSK Testnet
npm run deploy:rsk-mainnet # deploy to RSK Mainnet
```

## Deployments

**RSK Testnet:**

- Public contracts:
    - One Shot Schedule singleton: [`TBD`](https://explorer.testnet.rsk.co/address/TBD)
    - Proxy Factory: [`TBD`](https://explorer.testnet.rsk.co/address/TBD)
- RIF Instance:
    - Proxy: [`TBD`](https://explorer.testnet.rsk.co/address/TBD)
    - Proxy Admin: [`TBD`](https://explorer.testnet.rsk.co/address/TBD)

## Acknowledgments

Scheduled transaction times are not exact, they will be performed inside an execution window depending on the plan.
The contract also uses `block.timestamp` to stablish if the scheduled transaction should be executed and/or refunded,
which is subject to manipulation for short time periods.
