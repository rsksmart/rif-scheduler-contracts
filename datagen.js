const fs = require('fs');
const OneShotSchedule = require('./build/contracts/OneShotSchedule');

fs.writeFileSync('./OneShotSchedule.json', JSON.stringify({
  abi: OneShotSchedule.abi,
  bytecode: OneShotSchedule.bytecode
}));

fs.writeFileSync('./OneShotScheduleAddresses.json', JSON.stringify({
  address: {
    31: '0xff349c2df8ca32771153b5868b02bc812fb0172d'
  }
}));
