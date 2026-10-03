const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || 'C:\\Users\\allak\\Downloads\\apkpure-conformes';

function inspect(p) {
  const b = fs.readFileSync(p);
  const size = b.length;
  let format, w, h, bits, alpha, scan = '—';
  if (b[1] === 0x50 && b[2] === 0x4e) {
    format = 'PNG';
    w = b.readUInt32BE(16); h = b.readUInt32BE(20);
    const ct = b[25];
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct] || 0;
    bits = b[24] * ch;
    alpha = ct === 4 || ct === 6;
    scan = b[28] ? 'entrelace' : 'non entrelace';
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    format = 'JPEG';
    let i = 2;
    while (i < b.length - 8) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        // SOF (T.81): precision(1) lignes(2) colonnes(2) nb_canaux(1)
        const prec = b[i + 4], nc = b[i + 9];
        bits = prec * nc;
        alpha = nc >= 4;
        h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7);
        scan = (m === 0xc2 || m === 0xca) ? 'progressif' : 'baseline';
        break;
      }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  } else { format = 'INCONNU'; }
  const errs = [];
  const mn = Math.min(w, h), mx = Math.max(w, h);
  if (!w || !h) errs.push('illisible');
  if (mn < 320) errs.push('min < 320');
  if (mx > 3840) errs.push('max > 3840');
  if (mx > 2 * mn) errs.push('ratio > 2');
  if (alpha) errs.push('canal alpha');
  if (bits !== 24) errs.push('pas 24 bits');
  if (scan === 'progressif') errs.push('JPEG progressif');
  if (scan === 'entrelace') errs.push('PNG entrelace');
  if (size > 8 * 1024 * 1024) errs.push('> 8 Mo');
  return { w, h, mn, mx, bits, alpha, scan, size, format, errs };
}

const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort();
let ok = 0;
for (const f of files) {
  const r = inspect(path.join(dir, f));
  if (!r.errs.length) ok++;
  console.log(
    f.padEnd(28) +
    String(r.format).padEnd(5) +
    (r.w + 'x' + r.h).padEnd(11) +
    ('ratio=' + (r.mx / r.mn).toFixed(3)).padEnd(13) +
    ('bits=' + r.bits).padEnd(9) +
    ('alpha=' + (r.alpha ? 'OUI' : 'non')).padEnd(12) +
    r.scan.padEnd(15) +
    String(r.size).padStart(8) + '  ' +
    (r.errs.length ? 'KO  ' + r.errs.join(', ') : 'OK')
  );
}
console.log('\n' + ok + ' / ' + files.length + ' conformes dans ' + dir);
