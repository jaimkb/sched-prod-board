// Records the deployed board in use with Playwright in the installed Edge (frames from the DevTools screencast,
// encoded with the system ffmpeg), then joins the clips into one mp4.
// node scripts/record.mjs <board url> <out name>
// Writes recordings/<out name>.mp4 and .rec-tmp/<out name>.json (each ack's video time, intent and receipt).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [url, name] = process.argv.slice(2);
if (!url || !name) throw new Error('usage: node scripts/record.mjs <board url> <out name>');
const tmp = `.rec-tmp/${name}`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync('recordings', { recursive: true });
const size = { width: 1100, height: 640 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A recording overlay (not part of the build): video clock, caption and a cursor dot.
const overlay = ({ offset, label, t0 }) => {
  const pad = (n) => String(Math.floor(n)).padStart(2, '0');
  addEventListener('DOMContentLoaded', () => {
    const box = document.createElement('div');
    box.id = '__rec';
    box.style.cssText =
      'position:fixed;right:10px;bottom:10px;z-index:99999;font:13px/1.4 ui-monospace,monospace;background:#1d1d1fe6;color:#fff;padding:6px 10px;border-radius:6px;max-width:560px;pointer-events:none';
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;z-index:99999;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #e00;border-radius:50%;background:#e003;pointer-events:none;left:-20px;top:-20px';
    document.body.append(box, dot);
    addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    addEventListener('mousedown', () => (dot.style.background = '#e00'));
    addEventListener('mouseup', () => setTimeout(() => (dot.style.background = '#e003'), 250));
    window.__caption = '';
    const tick = () => {
      const s = offset + (Date.now() - t0) / 1000;
      box.textContent = `recording ${pad(s / 60)}:${pad(s % 60)} · viewer ${label} · ${window.__caption}`;
      requestAnimationFrame(tick);
    };
    tick();
  });
};

const browser = await chromium.launch({ channel: 'msedge' });
const acks = [];

async function clip(file, { locale, timezoneId, label, offset }, script) {
  const context = await browser.newContext({
    locale,
    timezoneId,
    viewport: size,
  });
  const t0 = Date.now(); // video time 0 for this clip; the overlay clock counts from it too
  await context.addInitScript(overlay, { offset, label, t0 });
  const page = await context.newPage();
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, ts: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  const at = () => offset + (Date.now() - t0) / 1000;
  page.on('console', (msg) => {
    const m = msg.text().match(/^ack (\S+) (\S+) (\S+)$/);
    if (m) acks.push({ id: m[1], ackedAt: m[2], receipt: m[3], videoSeconds: Number(at().toFixed(1)) });
  });
  const caption = (text) => page.evaluate((t) => (window.__caption = t), text);
  await script({ page, caption, at });
  await cdp.send('Page.stopScreencast');
  const seconds = (Date.now() - t0) / 1000;
  await context.close();
  // Hold each frame until the next one, so video time matches wall time from t0.
  const dir = `${tmp}/${file}-frames`;
  mkdirSync(dir);
  const lines = [];
  frames.forEach((f, i) => {
    writeFileSync(`${dir}/${i}.jpg`, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].ts : t0 / 1000 + seconds;
    const from = i === 0 ? t0 / 1000 : f.ts; // the first frame holds from video time 0
    lines.push(`file '${i}.jpg'`, `duration ${Math.max(next - from, 0.001).toFixed(3)}`);
  });
  lines.push(`file '${frames.length - 1}.jpg'`);
  writeFileSync(`${dir}/list.txt`, lines.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=25,scale=1100:640', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${tmp}/${file}`]);
  return seconds;
}

const rowIds = (page) => page.$$eval('[data-testid="incident-row"]', (rows) => rows.map((r) => r.dataset.id));
const ackBox = (page, id) => page.locator(`[data-testid="incident-row"][data-id="${id}"] [data-testid="ack"]`).boundingBox();
const notes = [];

// Clip 1 — the viewer's own machine (en-US, Chicago): open-board, watch-board, ack-incident.
const main = await clip('clip-1.mp4', { locale: 'en-US', timezoneId: 'America/Chicago', label: 'en-US · Chicago', offset: 0 }, async ({ page, caption, at }) => {
  await page.goto(url);
  await caption('open-board: the board loads tonight\'s incidents');
  await page.locator('[data-testid="incident-row"]').first().waitFor();
  notes.push({ flow: 'open-board', at: at(), top: (await rowIds(page))[0] });
  await sleep(3000);

  await caption('watch-board: waiting for a new incident, no reload');
  const before = (await rowIds(page))[0];
  await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]').dataset.id !== id, before, { timeout: 30000 });
  notes.push({ flow: 'watch-board', at: at(), arrived: (await rowIds(page))[0], previousTop: before });
  await sleep(3000);

  // ack-incident, calm: the list is still, click the third row's Ack.
  const calmTarget = (await rowIds(page))[2];
  await caption(`ack-incident: on-call takes ${calmTarget}`);
  const calm = await ackBox(page, calmTarget);
  await page.mouse.move(calm.x + calm.width / 2, calm.y + calm.height / 2, { steps: 15 });
  await sleep(600);
  notes.push({ flow: 'ack-incident', kind: 'calm', at: at(), aimedAt: calmTarget });
  await page.mouse.click(calm.x + calm.width / 2, calm.y + calm.height / 2);
  await page.locator(`[data-testid="incident-row"][data-id="${calmTarget}"] [data-testid="acked"]`).waitFor();
  await sleep(3000);

  // ack-incident, while the board moves: aim at a row, a new incident lands, the click lands where the pointer is.
  const ids = await rowIds(page);
  const aimed = ids.find((id, i) => i >= 1 && i <= 4 && id !== calmTarget);
  await caption(`ack-incident: on-call aims at ${aimed} as a new incident comes in`);
  const box = await ackBox(page, aimed);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 15 });
  const top = (await rowIds(page))[0];
  await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]').dataset.id !== id, top, { timeout: 30000, polling: 20 });
  const shiftAt = at();
  await sleep(150); // a person's click lands a moment after the row moved
  const under = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
  notes.push({ flow: 'ack-incident', kind: 'shift', shiftAt, at: at(), aimedAt: aimed, underPointer: under });
  await page.mouse.click(x, y);
  await sleep(1500);
  const actually = acks.at(-1)?.id;
  await caption(`aimed at ${aimed} → the click acked ${actually}; ${aimed} still open`);
  await sleep(5000);
});

// Clips 2 and 3 — the same board as viewers in Auckland and Berlin see it (R5), oldest row in view.
let offset = main;
for (const [file, locale, timezoneId, label] of [
  ['clip-2.mp4', 'en-NZ', 'Pacific/Auckland', 'en-NZ · Auckland'],
  ['clip-3.mp4', 'de-DE', 'Europe/Berlin', 'de-DE · Berlin'],
]) {
  offset += await clip(file, { locale, timezoneId, label, offset }, async ({ page, caption, at }) => {
    await page.goto(url);
    await caption(`local times: ${label}, day before month`);
    await page.locator('[data-testid="incident-row"]').first().waitFor();
    const last = page.locator('[data-testid="incident-row"]').last();
    await last.scrollIntoViewIfNeeded();
    notes.push({ flow: 'open-board', viewer: label, at: at(), oldest: await last.locator('time').evaluate((t) => ({ text: t.textContent, utc: t.dateTime })) });
    await sleep(5000);
  });
}
await browser.close();

const list = `${tmp}/list.txt`;
writeFileSync(list, ['clip-1.mp4', 'clip-2.mp4', 'clip-3.mp4'].map((f) => `file '${f}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', `recordings/${name}.mp4`]);
writeFileSync(`.rec-tmp/${name}.json`, JSON.stringify({ url, notes, acks, seconds: offset }, null, 2));
console.log(JSON.stringify({ notes, acks: acks.map((a) => ({ ...a, receipt: a.receipt.slice(0, 8) + '…' })), seconds: offset }, null, 2));
