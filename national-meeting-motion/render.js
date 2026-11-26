// Покадровый рендер HTML-анимации в MP4 (H.264) через Playwright + ffmpeg.
// node render.js disclaimer.html out/disclaimer.mp4 [start end] [--fps 25] [--still t1,t2]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const fps = +flag('--fps', 25);
  const still = flag('--still', null);
  const [src, out, s0, s1] = args;

  // локальный статический сервер: ES-модули (three.js) не грузятся с file://
  const http = require('http');
  const root = path.dirname(path.resolve(src));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split(/[?#]/)[0]));
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  }).listen(0);
  const port = server.address().port;

  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await page.goto(`http://localhost:${port}/` + path.basename(src));
  await page.waitForFunction(() => window.render && (window.READY !== false), null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => { const s = document.getElementById('stage'); return [s.offsetWidth, s.offsetHeight]; });
  await page.setViewportSize({ width: size[0], height: size[1] });
  const dur = await page.evaluate(() => window.DURATION);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (still) {
    for (const t of still.split(',').map(Number)) {
      await page.evaluate(t => window.render(t), t);
      await page.screenshot({ path: out.replace(/\.png$/, '') + `_t${t}.png` });
    }
    await browser.close(); server.close();
    return;
  }

  const start = s0 !== undefined ? +s0 : 0, end = s1 !== undefined ? +s1 : dur;
  const n = Math.round((end - start) * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.render(t), start + i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 50 === 0) process.stdout.write(`${i}/${n} ${new Date().toISOString().slice(11,19)}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close(); server.close();
  console.log('done', out);
})();
