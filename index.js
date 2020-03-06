const { join } = require('path');

const scrapy = require('./src/lib/scrapy');
const log = require('./src/lib/log');
const cleanUrl = require('./src/lib/cleanUrl');
const logRequest = require('./src/lib/logger');

const urls = process.argv.slice(2);

if (!urls || !urls.length) {
  return console.log(`Nothing to do..`);
}

logRequest(urls, join(__dirname, 'data.log'))

urls
.map(cleanUrl) // Validate and clean urls
.filter(url => url) // Remove params that failed validation
.reduce((download, url) => download.then(async _ => {
  try {
    const info = await scrapy.findDownloadInfo(url);
    const result = await scrapy.downloadVideo(info);
    log.info(result);
  } catch(error) {
    log.error(`Error downloading ${url}:  ${error.message}`);
  }
}), Promise.resolve(null));
