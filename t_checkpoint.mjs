import fs from 'fs';
const data = JSON.parse(fs.readFileSync('.upload-checkpoints/test-folder.json', 'utf8'));
const uploaded = data.uploaded || {};
let counts = { UPLOADED: 0, SKIPPED: 0, RESERVED: 0 };
Object.values(uploaded).forEach(entry => {
  let s = (entry.status || '').toUpperCase();
  if (counts[s] !== undefined) counts[s]++;
});
console.log('JSON_START');
console.log(JSON.stringify({
  counts,
  totalTracked: Object.keys(uploaded).length,
  percent: (((counts.UPLOADED + counts.SKIPPED) / 22010) * 100).toFixed(2) + '%'
}));
console.log('JSON_END');
