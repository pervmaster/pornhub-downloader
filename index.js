const fs = require('fs');
const { join } = require('path');

const scrapy = require('./src/lib/scrapy');
const log = require('./src/lib/log');

const urls = process.argv.slice(2);

if (!urls || !urls.length) {
  return console.log(`Nothing to do..`);
}

fs.appendFileSync(join(__dirname, 'data.log'), `${JSON.stringify({
  timestamp: parseInt(+new Date/1000),
  urls
})}\n`);

urls.reduce((download, url) => download
.then(async _ => {
  if (!url || !url.trim().length) {
    return;
  }

  if (url.includes('thumbzilla.com') || url.slice(0,2) === 'ph') {
    const key = url.length === 15 ? url : url.slice(url.search('video/ph') + 6).slice(0, 15);
    url = `https://www.pornhub.com/view_video.php?viewkey=${key}`;
  }

  try {
    const info = await scrapy.findDownloadInfo(url);
    const result = await scrapy.downloadVideo(info);
    log.info(result);
  } catch(error) {
    log.error(`Error downloading ${url}:  ${error.message}`);
  }
}), Promise.resolve(null));
