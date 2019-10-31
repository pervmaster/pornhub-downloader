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

    if (url.includes('thumbzilla.com')) {
      const parts = url.split('/');
      const key = parts[parts.length - 2];
      url = `https://www.pornhub.com/view_video.php?viewkey=${key}`;
    }

    const info = await scrapy.findDownloadInfo(url);
    const result = await scrapy.downloadVideo(info);
    log.info(result);
    console.log('\n');
  });
})();
