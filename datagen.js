const fs = require('fs');
const RIFScheduler = require('./build/contracts/RIFScheduler');

fs.writeFileSync('./RIFScheduler.json', JSON.stringify({
  abi: RIFScheduler.abi,
  bytecode: RIFScheduler.bytecode
}));

fs.writeFileSync('./RIFSchedulerAddresses.json', JSON.stringify({
  address: {
    31: '0xad249557515d8b89f2869834857bb872d7b5c398'
  }
}));
