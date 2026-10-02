const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
async function download(url, target, redirects = 0) {
  if (redirects > 10) throw Error('Too many redirects');
  const response = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Faceclaw-Spanish-build' } }, resolve).on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.resume();
    return download(new URL(response.headers.location, url).href, target, redirects + 1);
  }
  if (response.statusCode !== 200) { response.resume(); throw Error(`HTTP ${response.statusCode}: ${url}`); }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await pipeline(response, fs.createWriteStream(target + '.partial'));
  fs.renameSync(target + '.partial', target);
  console.log(`Downloaded ${path.basename(target)} (${fs.statSync(target).size} bytes)`);
}
if (require.main === module) download(process.argv[2], process.argv[3]).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { download };
