const { URL } = require('url');

const PH = 'pornhub.com';
const PR = 'pornhubpremium.com';
const TH = 'thumbzilla.com';

// TODO: Find out the min and max key lengths
const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 15;

const getUrl = (key, host = `www.${PH}`) => {
  return `https://${host}/view_video.php?viewkey=${key}`;
}

const cleanUrl = url => {
  try {
    // Check if url is actually being passed in as just the key
    if (url.length >= MIN_KEY_LENGTH && url.length <= MAX_KEY_LENGTH) {
      return getUrl(url);
    }

    // Otherwise try to load as url object
    const urlObj = new URL(url);

    // Check if url is actually an alternate link
    if (url.includes(TH)) {
      const key = url.slice(url.search('/video/') + 7).split('/')[0];

      return key.length ? getUrl(key) : false;
    }

    // Check if url is regular or premium format
    if (url.includes(PH) || url.includes(PR)) {
      const key = urlObj.searchParams.get('viewkey');

      return key.length ? getUrl(key, urlObj.host) : false;
    }

    return false;
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);

    return false;
  }
};

module.exports = cleanUrl;
