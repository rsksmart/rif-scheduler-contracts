const fs = require('fs');
const OneShotSchedule = require('./build/contracts/OneShotSchedule');

fs.writeFileSync('./OneShotSchedule.json', JSON.stringify({
  abi: OneShotSchedule.abi,
  bytecode: OneShotSchedule.bytecode
}));

fs.writeFileSync('./OneShotScheduleAddresses.json', JSON.stringify({
  address: {
    31: '0x0372f6f8c7b2353b546f842da0c44749664d1203'
  }
}));
