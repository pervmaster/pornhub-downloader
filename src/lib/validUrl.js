const { URL } = require('url');

const cleanUrl = url => {
  // Remove junk, minimum length of possible valid case would be a key alone 15 chars
  if (!url || url.trim().length < 15) {
    return false;
  }

  // Check if url is actually a key.  Rules: 15 characters and starts with 'ph'
  if (url.slice(0, 2) === 'ph' && url.length === 15) {
    const key = url;

    return `https://www.pornhub.com/view_video.php?viewkey=${key}`;
  }

  // Check if url is actually a thumbzilla link
  if (url.includes('thumbzilla.com')) {
    const key = url.slice(url.search('/video/ph') + 7).slice(0, 15);

    return key.length === 15 ? `https://www.pornhub.com/view_video.php?viewkey=${key}` : false;
  }

  // Check if url is pornhub format
  if (url.includes('pornhub.com')) {
    const url = new URL(url);
    const query = new URLSearchParams(url.search);
    const key = query.get('viewkey');

    return key.length === 15 ? `https://www.pornhub.com/view_video.php?viewkey=${key}` : false;
  }

  // Fail everything else
  return false;
};

module.exports = cleanUrl;
