// «Ветер перемен» — общий движок лент и порывов ветра для motion-графики.
// Всё детерминировано от времени t (сек), чтобы кадры рендерились покадрово.

const LOOP = 10; // период «дыхания» лент и потока, сек — даёт бесшовный луп

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = k => 1 - Math.pow(1 - clamp(k), 3);
const easeInOutCubic = k => { k = clamp(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const easeOutExpo = k => { k = clamp(k); return k === 1 ? 1 : 1 - Math.pow(2, -10 * k); };
const easeInCubic = k => Math.pow(clamp(k), 3);
const prog = (t, start, dur) => clamp((t - start) / dur);

function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, k));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
  const bl = Math.round(lerp(pa & 255, pb & 255, k));
  return `rgb(${r},${g},${bl})`;
}

function bez(P, s) {
  const u = 1 - s;
  const x = u*u*u*P[0][0] + 3*u*u*s*P[1][0] + 3*u*s*s*P[2][0] + s*s*s*P[3][0];
  const y = u*u*u*P[0][1] + 3*u*u*s*P[1][1] + 3*u*s*s*P[2][1] + s*s*s*P[3][1];
  const dx = 3*u*u*(P[1][0]-P[0][0]) + 6*u*s*(P[2][0]-P[1][0]) + 3*s*s*(P[3][0]-P[2][0]);
  const dy = 3*u*u*(P[1][1]-P[0][1]) + 6*u*s*(P[2][1]-P[1][1]) + 3*s*s*(P[3][1]-P[2][1]);
  const l = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / l, ny: dx / l };
}

// Лента с поворотом: лицевая сторона — кобальт LDB, изнанка — светлый шёлк.
// from/to — видимый отрезок (0..1) для анимации появления и ухода.
function drawRibbon(ctx, r, t, from, to) {
  if (to - from < 0.002) return;
  const ph = (t / LOOP) * Math.PI * 2;
  const P = r.P.map((p, i) => {
    const a = r.flutter * (i === 1 || i === 2 ? 1 : 0.35);
    return [p[0] + Math.cos(ph + r.seed + i) * a * 0.5, p[1] + Math.sin(ph + r.seed * 1.7 + i * 0.8) * a];
  });
  const N = 260;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const s = lerp(from, to, i / N);
    const b = bez(P, s);
    const taper = Math.pow(Math.sin(Math.PI * clamp(s * 0.96 + 0.02)), 0.75);
    const w = r.width * (0.04 + 0.96 * taper);
    const th = r.twistPhase + ph * r.twistSpeed + r.twist * Math.PI * 2 * s;
    const c = Math.cos(th);
    pts.push({ ...b, w, c, s });
  }

  // мягкая тень ленты
  ctx.save();
  ctx.shadowColor = 'rgba(20,35,90,0.18)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 26;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const ea = a.w * a.c, eb = b.w * b.c;
    const front = (a.c + b.c) >= 0;
    const lit = Math.abs((a.c + b.c) / 2);
    const col = front
      ? mixHex(r.deep || '#1a2fa6', r.bright || '#3b5cf2', 0.25 + 0.75 * lit)
      : mixHex('#b9c8f4', '#f4f7ff', lit);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x + a.nx * ea, a.y + a.ny * ea);
    ctx.lineTo(b.x + b.nx * eb, b.y + b.ny * eb);
    ctx.lineTo(b.x - b.nx * eb, b.y - b.ny * eb);
    ctx.lineTo(a.x - a.nx * ea, a.y - a.ny * ea);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (i === 0) { ctx.shadowColor = 'transparent'; }
  }
  ctx.restore();

  // блик по кромке
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const e = p.w * p.c;
    const x = p.x + p.nx * e, y = p.y + p.ny * e;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  // полупрозрачный шёлк над лентой
  if (r.silk) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const silkPts = pts.map(p => {
      const lift = r.silk * Math.sin(Math.PI * p.s) * (0.8 + 0.2 * Math.sin(ph * 2 + p.s * 6 + r.seed));
      return { x: p.x - p.nx * lift, y: p.y - p.ny * lift, nx: p.nx, ny: p.ny, w: p.w * 2.2, s: p.s };
    });
    const g = ctx.createLinearGradient(silkPts[0].x, silkPts[0].y, silkPts[N].x, silkPts[N].y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    silkPts.forEach((p, i) => { const x = p.x + p.nx * p.w * 0.5, y = p.y + p.ny * p.w * 0.5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = N; i >= 0; i--) { const p = silkPts[i]; ctx.lineTo(p.x - p.nx * p.w * 0.5, p.y - p.ny * p.w * 0.5); }
    ctx.closePath();
    ctx.fill();
    // волокна шёлка
    ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const off = (k / 8 - 0.5) * 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.22 * (1 - Math.abs(off))})`;
      ctx.beginPath();
      silkPts.forEach((p, i) => {
        const wav = Math.sin(p.s * 9 + k * 1.3 + ph) * 6;
        const o = p.w * off + wav;
        const x = p.x + p.nx * o, y = p.y + p.ny * o;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Тонкие порывы ветра — бесшовный луп с периодом LOOP.
function drawGusts(ctx, W, H, t, alpha = 1, count = 22) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const rnd = (n) => { const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
    const laps = 1 + Math.floor(rnd(1) * 2);
    const k = ((t / LOOP) * laps + rnd(2)) % 1;
    const len = 160 + rnd(3) * 380;
    const x = k * (W + len + 400) - len - 200;
    const y0 = H * (0.1 + rnd(4) * 0.85);
    const curve = (rnd(5) - 0.5) * 60;
    const a = alpha * (0.10 + rnd(6) * 0.22) * Math.sin(Math.PI * k);
    const g = ctx.createLinearGradient(x, 0, x + len, 0);
    g.addColorStop(0, 'rgba(59,92,242,0)');
    g.addColorStop(0.7, `rgba(59,92,242,${a})`);
    g.addColorStop(1, 'rgba(59,92,242,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1 + rnd(7) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y0 + curve);
    ctx.quadraticCurveTo(x + len * 0.5, y0 - curve * 0.6 - x * 0.02, x + len, y0 - curve - (x + len) * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(ctx, W, H, theme = 'light') {
  if (theme === 'dark') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0d1838'); g.addColorStop(1, '#0a1230');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = ctx.createRadialGradient(W * 0.78, H * 0.55, 0, W * 0.78, H * 0.55, W * 0.6);
    r.addColorStop(0, 'rgba(59,92,242,0.35)'); r.addColorStop(1, 'rgba(59,92,242,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#fbfaf7');
  g.addColorStop(0.55, '#f5f7fc');
  g.addColorStop(1, '#e8eefc');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.12, H * 0.05, 0, W * 0.12, H * 0.05, W * 0.55);
  r.addColorStop(0, 'rgba(255,250,240,0.9)'); r.addColorStop(1, 'rgba(255,250,240,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  const b = ctx.createRadialGradient(W * 0.85, H * 0.8, 0, W * 0.85, H * 0.8, W * 0.5);
  b.addColorStop(0, 'rgba(59,92,242,0.10)'); b.addColorStop(1, 'rgba(59,92,242,0)');
  ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
}

// Стиль появления текста «на ветру»: сдвиг по ветру + расфокус → резкость.
function windIn(el, k, dist = 60) {
  const e = easeOutExpo(k);
  el.style.opacity = clamp(k * 1.6);
  el.style.transform = `translateX(${(1 - e) * -dist}px)`;
  el.style.filter = `blur(${(1 - e) * 10}px)`;
}
function windOut(el, k, dist = 120) {
  const e = easeInCubic(k);
  el.style.opacity = 1 - clamp(k * 1.3);
  el.style.transform = `translateX(${e * dist}px)`;
  el.style.filter = `blur(${e * 12}px)`;
}
