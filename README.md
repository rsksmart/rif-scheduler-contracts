<p align="middle">
    <img src="https://www.rifos.org/assets/img/logo.svg" alt="logo" height="100" >
</p>
<h3 align="middle">RIF Scheduler contracts POC</h3>
<p align="middle">
    RIF Scheduler smart contracts
</p>
<p align="middle">
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/ci.yml/badge.svg" alt="ci" />
    </a>
    <a href="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml" alt="ci">
        <img src="https://github.com/rsksmart/rif-scheduler-contracts/actions/workflows/scan.yml/badge.svg" alt="ci" />
    </a>
</p>

RIF Scheduler smart contracts are used to
- pay for the service with RIF tokens,
- schedule transactions,
- check transaction execution statuses and
- allow the service provider to execute the transactions and collect their reward

## Run for development

Install dependencies:

```
npm i
```

### Run unit tests

```
npm test
```

Coverage report with:

```
npm run coverage
```

### Run linter

```
npm run lint
```

Auto-fix:

```
npm run lint:fix
```

### Static analysis

First install [`slither`](https://github.com/crytic/slither) and run:

```
slither .
```

## Acknowledgment
Scheduled transaction times are not exact, they will be performed inside an execution window depending on the plan.
The contract also uses `block.timestamp` to stablish if the scheduled transaction should be executed and/or refunded,
which is subject to manipulation for short time periods.
