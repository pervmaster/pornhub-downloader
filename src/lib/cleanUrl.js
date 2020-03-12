const { URL } = require('url');

const LINK_PREFIX = 'https://www.pornhub.com/view_video.php?viewkey=';
const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 15;
// TODO: Find out the min and max key lengths

const cleanUrl = url => {
  if (!url || url.constructor !== String) {
    throw new Error('Bad param');
  }

  // Check if url is actually a key.
  if (url.length >= MIN_KEY_LENGTH && url.length <= MAX_KEY_LENGTH) {
    return `${LINK_PREFIX}${url}`;
  }

  // Check if url is actually a thumbzilla link
  if (url.includes('thumbzilla.com')) {
    const key = url.slice(url.search('/video/') + 7).split('/')[0];

    return key.length ? `${LINK_PREFIX}${key}` : false;
  }

  // Check if url is pornhub format
  if (url.includes('pornhub.com')) {
    const urlObj = new URL(url);
    const query = new URLSearchParams(urlObj.search);
    const key = query.get('viewkey');

    return key.length ? `${LINK_PREFIX}${key}` : false;
  }

  return false;
};

module.exports = cleanUrl;
