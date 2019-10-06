const scrapy = require('../lib/scrapy');
const log = require('../lib/log');
const urls = process.argv.slice(2);

(_ => {
  if (!urls || !urls.length) {
    return console.log(`Nothing to do..`);
  }

  urls.map(async url => {
    if (!url || !url.trim().length) {
      return;
    }

    const info = await scrapy.findDownloadInfo(url);
    const result = await scrapy.downloadVideo(info);
    log.info(result);
    console.log('\n');
  });
})();
