const fse = require('fs-extra');
const cheerio = require('cheerio');
const request = require('request');
const path = require('path');
const _ = require('lodash');
const moment = require('moment');

const config = require('../config.json');
const utils = require('./utils');
const log = require('./log');
const ProgressBar = require('progress');

const baseUrl = 'https://www.pornhub.com';
const hds = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'
};
const baseReqOpts = {
  headers: hds
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
  const pm = new Promise((resolve, reject) => {
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

  return pm;
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

  const videoId = parts[1];
  const idx2 = bodyStr.indexOf(`var flashvars_${videoId}`);
  const flashVarsLength = bodyStr.substr(idx2).indexOf('loadScriptUniqueId.push(');

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
  const pm = new Promise((resolve, reject) => {
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
      if (ditem) {
        ditem.key = finalKey;
      }

      return resolve(ditem);
    });
  });

  return pm;
};

const getTmp = dir => path.join(dir, `${new Buffer.from(`${+new Date}`, 'binary').toString('base64').replace(/=/g, '')}.tmp`);

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
  const dst = path.join(dir, filename);
  const tmp = getTmp(dir);

  const pm = new Promise((resolve, reject) => {
    if (fse.existsSync(dst)) {
      return resolve(`${dst} already exists!`);
    }
    let opts = {
      url: ditem.videoUrl
    };
    Object.assign(opts, baseReqOpts);
    log.verbose(`downloading > ${filename}`);

    const maxChunkLen = 20 * 1024 * 1024; // 20M

    return request.get(opts)
      .on('response', async resp => {
        const resHeaders = resp.headers;
        const ctLength = resHeaders['content-length'];
        const bar = new ProgressBar('downloading :bar :rate/bps :percent :etas', parseInt(ctLength));

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

          log.info(`the file is big, need to split it to ${rgs.length} pieces`);
          const files = [];
          let idx = 0;
          let len = 0;

          for (const item of rgs) {
            const copyOpts = _.cloneDeep(opts);
            copyOpts.headers['Range'] = `bytes=${item.start}-${item.end}`;
            copyOpts.headers['Connection'] = 'keep-alive';

            const file = path.join(dir, `${ditem.key}${idx}`);
            files.push(file);
            log.info(`downloading the ${idx + 1}/${rgs.length} piece...`);

            try {
              const oneFile = await (new Promise((resolve, reject) => {
                if (fse.existsSync(file)) {
                  log.info(`file already exists:  ${file}`);

                  const stats = fse.statSync(file);
                  const expectedSize = item.end - item.start;

                  if (Math.abs(stats['size'] - expectedSize) < 10) {
                    log.info(`file look like it's about the right size, skipping...`);
                    len += stats['size'];
                    return resolve(`skipping file${idx}`);
                  } else {
                    log.info(`file is ${stats['size']} bytes, but should be ${expectedSize} bytes, deleting and redownloading...`);
                    fse.unlinkSync(file);
                  }
                }

                const t0 = new Date();

                request.get(copyOpts)
                  .on('error', err => {
                    reject(err);
                  })
                  .on('response', response => {
                    response.on('data', chunk => {
                      len += chunk.length;
                      bar.tick(chunk.length);
                    });
                  })
                  .pipe(fse.createWriteStream(file, { encoding: 'binary' }))
                  .on('close', () => {
                    resolve(`file${idx} has been downloaded! (${(new Date() - t0)/1000} seconds)`);
                  });
              }));
              idx += 1;
            } catch (error) {
              return reject(error);
            }
          }

          log.info('all pieces have been downloaded!');
          log.info('now, concat pieces...');

          const ws = fse.createWriteStream(tmp, { flag: 'a' })
          .addListener('finish', _ => {
            log.info('rename file...');
            fse.renameSync(tmp, dst);

            if (fse.existsSync(tmp)) {
              log.info('Error renaming file!');
              return reject(new Error('Error renaming file!'));
            }

            // delete temp files
            log.info('now, delete pieces...');
            files.forEach(file => {
              fse.unlinkSync(file);
            });

            ws.removeAllListeners();

            return resolve(`${dst} has been downloaded!`);
          })
          .addListener('error', error => {
            log.info('Error saving file!');
            log.info(err);

            ws.removeAllListeners();

            return reject(error);
          });

          files.forEach(file => {
            const bf = fse.readFileSync(file);
            ws.write(bf);
          });
          ws.end();
        } else {
          const copyOpts = _.cloneDeep(opts);
          copyOpts.headers['Range'] = `bytes=0-${ctLength - 1}`;
          copyOpts.headers['Connection'] = 'keep-alive';
          let len = 0;
          return request.get(copyOpts)
            .on('error', err => {
              return reject(err);
            })
            .on('response', resp => {
              const ws = fse.createWriteStream(dst, { encoding: 'binary' });
              resp.on('error', err => {
                return reject(err);
              });
              resp.on('data', chunk => {
                ws.write(chunk);
                len += chunk.length;
                bar.tick(chunk.length);
              });
              resp.on('end', () => {
                ws.end();
                console.log();
                return resolve(`${dst} has been downloaded!`);
              });
            });
        }
      });
  });

  return pm;
};

module.exports = {
  findKeys,
  findDownloadInfo,
  downloadVideo
};
