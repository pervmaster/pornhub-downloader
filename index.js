const fs = require('fs');
const { join } = require('path');

const scrapy = require('../lib/scrapy');

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

  if (url.includes('thumbzilla.com')) {
    const parts = url.split('/');
    const key = parts[parts.length - 2];
    url = `https://www.pornhub.com/view_video.php?viewkey=${key}`;
  }

  try {
    const info = await scrapy.findDownloadInfo(url);
    const result = await scrapy.downloadVideo(info);
    console.log(result);
  } catch(error) {
    console.log(`Error downloading ${url}:  ${error.message}`);
  }
}), Promise.resolve(null));
