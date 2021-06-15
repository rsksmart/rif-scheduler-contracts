const fs = require('fs');
const RIFScheduler = require('./build/contracts/RIFScheduler');

fs.writeFileSync('./RIFScheduler.json', JSON.stringify({
  abi: RIFScheduler.abi,
  bytecode: RIFScheduler.bytecode
}));

fs.writeFileSync('./RIFSchedulerAddresses.json', JSON.stringify({
  address: {
    31: '0xff349c2df8ca32771153b5868b02bc812fb0172d'
  }
}));
