const fs = require('fs');
const OneShotSchedule = require('./build/contracts/OneShotSchedule');

fs.writeFileSync('./OneShotScheduleABI.json', JSON.stringify({ abi: OneShotSchedule.abi }));
fs.writeFileSync('./OneShotScheduleAddresses.json', JSON.stringify({ bytecode: OneShotSchedule.bytecode }));
fs.writeFileSync('./OneShotScheduleBytecode.json', JSON.stringify({
  address: {
    31: '0x0372f6f8c7b2353b546f842da0c44749664d1203'
  }
}));
