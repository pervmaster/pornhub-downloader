const fse = require('fs-extra');
const cheerio = require('cheerio');
const request = require('request');
const path = require('path');
const _ = require('lodash');
const moment = require('moment');

const config = require('../config.json');
const utils = require('./utils');
const print = require('./print');
const ProgressBar = require('progress');

const baseUrl = 'https://www.pornhub.com';
const headers = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'
};

const baseReqOpts = {
  headers: headers
};

// proxy
if (config.proxyUrl.trim().length > 0) {
  baseReqOpts.proxy = config.proxyUrl.trim();
}

// timeout
if (config.timeout > 0) {
  baseReqOpts.timeout = config.timeout;
}

const findKeys = (opts) => {
  return new Promise((resolve, reject) => {
    let pageUrl = baseUrl;
    let queryObj = {};
    let reqOpts = {
      // url: pageUrl,
      baseUrl,
      qs: queryObj,
    };

    if (opts) {
      if (opts.pathname && opts.pathname.trim().length > 0) {
        pageUrl = baseUrl + path.join('', opts.pathname.trim());
        reqOpts.uri = opts.pathname.trim();
      } else if (opts.search && opts.search.trim().length > 0) {
        pageUrl = `${baseUrl}/video/search`;
        reqOpts.uri = '/video/search';
        queryObj.search = encodeURI(opts.search.trim());
      } else {
        delete reqOpts.baseUrl;
        reqOpts.url = pageUrl;
      }

      if (opts.page && opts.page > 1) {
        queryObj.page = opts.page;
      }
    }

    Object.assign(reqOpts, baseReqOpts);
    request(reqOpts, (err, res, body) => {
      if (err) {
        return reject(err);
      }

      const $ = cheerio.load(body);
      const allKeys = [];
      $('.videoblock.videoBox').each((idx, element) => {
        const key = element.attribs['_vkey'];
        allKeys.push(key);
      });

      const skipKeys = [];
      $('.dropdownHottestVideos .videoblock.videoBox').each((idx, element) => {
        const key = element.attribs['_vkey'];
        skipKeys.push(key);
      });

      $('.dropdownReccomendedVideos .videoblock.videoBox').each((idx, element) => {
        const key = element.attribs['_vkey'];
        skipKeys.push(key);
      });

      const keys = [];
      allKeys.forEach(k => {
        if (-1 === skipKeys.indexOf(k)) {
          keys.push(k);
        }
      });

      return resolve(keys);
    });
  });
};

const findTitle = (bodyStr) => {
  const $ = cheerio.load(bodyStr);
  const title = $('title').text();
  const arr = title.split('-');
  arr.pop();

  return arr.join('-');
};

const parseDownloadInfo = (bodyStr) => {
  let info;
  const idx = bodyStr.indexOf('<div id="player"');

  if (idx < 0) {
    return info;
  }

  const chunk = bodyStr.substr(idx, bodyStr.substr(idx).indexOf('">'));
  const parts = chunk.split('data-video-id="');

  if (!chunk || !parts.length) {
    return info;
  }

  const videoId = parts[1].indexOf('"') ? parts[1].split('"')[0] : parts[1];
  const idx2 = bodyStr.indexOf(`var flashvars_${videoId}`);
  const flashVarsLength = bodyStr.substr(idx2).indexOf('playerObjList.playerDiv_');

  eval(bodyStr.substr(idx2, flashVarsLength));
  const videoOptions = eval(`qualityItems_${videoId}`);

  if (videoOptions && videoOptions.length) {
    vid = videoOptions[videoOptions.length - 1];
    info = {
      quality: vid.text,
      videoUrl: vid.url,
      format: 'mp4',
      title: findTitle(bodyStr),
    };
  }

  return info;
};

const findDownloadInfo = (key) => {
  let finalKey = key;

  return new Promise((resolve, reject) => {
    let pageUrl = `https://www.pornhub.com/view_video.php?viewkey=${key}`;

    if (key.startsWith('http')) {
      pageUrl = key;
      finalKey = key.split('=').pop();
    }

    let opts = {
      url: pageUrl
    };

    Object.assign(opts, baseReqOpts);

    request(opts, (err, res, body) => {
      if (err) {
        return reject(err);
      }

      const ditem = parseDownloadInfo(body);

      if (!ditem) {
        return reject(new Error('Unable to get download info'));
      }

      if (ditem) {
        ditem.key = finalKey;
      }

      return resolve(ditem);
    });
  });
};


const downloadVideo = (ditem) => {
  let filename = moment().format('YYYYMMDD');

  if (ditem.title && ditem.title.trim().length > 0) {
    filename = ditem.title.trim();
  }

  filename += `_${ditem.quality}P_${ditem.key}.mp4`;
  filename = utils.clearFileName(filename);

  const dir = config.downloadDir || './downloads';

  if (!fse.existsSync(dir)) {
    fse.mkdirpSync(dir);
  }

  const destinationFilename = path.join(dir, filename);
  const tempFilename = utils.getTempFilename(dir, ditem.key);

  return new Promise((resolve, reject) => {
    if (fse.existsSync(destinationFilename)) {
      return resolve(`${destinationFilename} already exists!`);
    }

    let opts = {
      url: ditem.videoUrl
    };

    Object.assign(opts, baseReqOpts);
    print.verbose(`downloading > ${filename}`);

    const maxChunkLen = 20 * 1024 * 1024; // 20M

    return request.get(opts)
    .on('response', async resp => {
      const resHeaders = resp.headers;
      const ctLength = resHeaders['content-length'];
      const bar = new ProgressBar(' :bar :rate/bps :percent :etas', parseInt(ctLength));

      if (ctLength > maxChunkLen) {
        const rgs = [];
        const num = parseInt(ctLength / maxChunkLen);
        const mod = parseInt(ctLength % maxChunkLen);

        for (let i = 0; i < num; i++) {
          const rg = {
            start: i === 0 ? i : i * maxChunkLen + 1,
            end: (i + 1) * maxChunkLen
          };
          rgs.push(rg);
        }

        if (mod > 0) {
          const rg = {
            start: num * maxChunkLen + 1,
            end: ctLength
          };
          rgs.push(rg);
        }

        rgs[rgs.length - 1].end = rgs[rgs.length - 1].end - 1;

        const files = [];
        let idx = 0;

        for (const item of rgs) {
          const copyOpts = _.cloneDeep(opts);
          copyOpts.headers['Range'] = `bytes=${item.start}-${item.end}`;
          copyOpts.headers['Connection'] = 'keep-alive';

          const file = path.join(dir, `${ditem.key}${idx}`);
          files.push(file);

          try {
            await (new Promise((resolve, reject) => {
              if (fse.existsSync(file)) {

                const stats = fse.statSync(file);
                const expectedSize = item.end - item.start;

                if (Math.abs(stats['size'] - expectedSize) < 10) {
                  bar.tick(stats['size']);
                  return resolve(`skipping file${idx}`);
                } else {
                  fse.unlinkSync(file);
                }
              }

              request.get(copyOpts)
              .on('error', reject)
              .on('response', response => response.on('data', chunk => bar.tick(chunk.length)))
              .pipe(fse.createWriteStream(file, { encoding: 'binary' }))
              .on('close', _ => resolve(`file${idx} has been downloaded!`));
            }));
            idx++;
          } catch (error) {
            return reject(error);
          }
        }

        const writeStream = fse.createWriteStream(tempFilename, { flag: 'a' })
        .addListener('finish', _ => {
          fse.renameSync(tempFilename, destinationFilename);

          if (fse.existsSync(tempFilename)) {
            return reject(new Error('Error renaming file!'));
          }

          // delete temp files
          files.forEach(file => {
            fse.unlinkSync(file);
          });

          writeStream.removeAllListeners();

          return resolve(`${filename} has been downloaded!`);
        })
        .addListener('error', error => {
          writeStream.removeAllListeners();

          print.error('Error saving file!');
          print.error(err);

          return reject(error);
        });

        files.forEach(file => {
          const buffer = fse.readFileSync(file);
          writeStream.write(buffer);
        });
        writeStream.end();
      } else {
        const copyOpts = _.cloneDeep(opts);
        copyOpts.headers['Range'] = `bytes=0-${ctLength - 1}`;
        copyOpts.headers['Connection'] = 'keep-alive';

        return request.get(copyOpts)
        .on('error', err => {
          request.removeAllListeners();

          return reject(err);
        })
        .on('response', response => {
          const writeStream = fse.createWriteStream(destinationFilename, { encoding: 'binary' });

          response.on('error', error => {
            response.removeAllListeners();

            return reject(error);
          })
          .on('data', chunk => {
            writeStream.write(chunk);
            bar.tick(chunk.length);
          })
          .on('end', () => {
            writeStream.end();
            response.removeAllListeners();

            return resolve(`${filename} has been downloaded!`);
          });
        });
      }
    });
  });
};

module.exports = {
  findKeys,
  findDownloadInfo,
  downloadVideo
};
