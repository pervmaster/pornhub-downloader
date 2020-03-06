const fs = require('fs');

const logger = async (urls, logFile) => {
  if (!fs.existsSync(logFile)) {
    throw new Error('Logfile does not exist!');
  }

  const data = {
    timestamp: parseInt(+new Date/1000),
    urls
  };

  return fs.appendFileSync(logFile, `${JSON.stringify(data)}\n`);
}

module.exports = logger;
