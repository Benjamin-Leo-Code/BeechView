'use strict';
// End-to-end test against a throwaway library that mimics Pinchflat's layout.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beechview-'));
process.env.MEDIA_ROOT = root;
process.env.SCAN_TTL_SECONDS = '0';
process.env.HA_OPTIONS = '/nonexistent';
const { createServer, cleanTitle } = require('../server');

function write(rel, data = 'x') {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
}

write('Channel A/poster.jpg');
write('Channel A/Season 2024/s2024e1105 - Second [abcdefghijk]/s2024e1105 - Second [abcdefghijk].mp4', Buffer.alloc(1000, 1));
write('Channel A/Season 2024/s2024e1105 - Second [abcdefghijk]/s2024e1105 - Second [abcdefghijk]-thumb.jpg');
write('Channel A/Season 2024/s2024e1001 - First [bbbbbbbbbbb]/s2024e1001 - First [bbbbbbbbbbb].mp4', Buffer.alloc(10, 2));
write('Channel A/.hidden.mp4');
write('Channel B/2024-01-02 Hello.webm');
write('.stfolder/x.mp4');
// Channel B has the most recently downloaded video, so it should come first.
const day = 24 * 3600;
const now = Date.now() / 1000;
fs.utimesSync(path.join(root, 'Channel B/2024-01-02 Hello.webm'), now, now);
for (const f of ['s2024e1105 - Second [abcdefghijk]', 's2024e1001 - First [bbbbbbbbbbb]']) {
  fs.utimesSync(path.join(root, 'Channel A/Season 2024', f, f + '.mp4'), now - day, now - day);
}

let base, server;
test.before(() => new Promise((r) => {
  server = createServer().listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    r();
  });
}));
test.after(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('lists each folder as a show, most recently updated first', async () => {
  const { shows } = await (await fetch(base + '/api/shows')).json();
  assert.deepStrictEqual(shows.map((s) => s.name), ['Channel B', 'Channel A']);
  assert.strictEqual(shows[1].episodeCount, 2);
  assert.match(shows[1].poster, /poster\.jpg$/);
});

test('new folders appear without a restart', async () => {
  write('Channel C/new.mp4');
  const { shows } = await (await fetch(base + '/api/shows')).json();
  assert.ok(shows.some((s) => s.name === 'Channel C'));
});

test('episodes are newest first with titles, dates and thumbnails', async () => {
  const show = await (await fetch(base + '/api/shows/' + encodeURIComponent('Channel A'))).json();
  assert.deepStrictEqual(show.episodes.map((e) => e.title), ['Second', 'First']);
  assert.deepStrictEqual(show.episodes.map((e) => e.date), ['2024-11-05', '2024-10-01']);
  assert.ok(show.episodes[0].thumb.endsWith('-thumb.jpg'));
  assert.strictEqual(show.episodes[0].playable, true);
  const b = await (await fetch(base + '/api/shows/Channel%20B')).json();
  assert.strictEqual(b.episodes[0].date, '2024-01-02');
  assert.strictEqual(b.episodes[0].playable, false);
});

test('video supports byte ranges (needed by Safari)', async () => {
  const show = await (await fetch(base + '/api/shows/Channel%20A')).json();
  const r = await fetch(base + '/' + show.episodes[0].src, { headers: { Range: 'bytes=0-1' } });
  assert.strictEqual(r.status, 206);
  assert.strictEqual(r.headers.get('content-range'), 'bytes 0-1/1000');
  assert.strictEqual((await r.arrayBuffer()).byteLength, 2);
});

test('refuses path traversal and hidden files', async () => {
  for (const p of ['/media/..%2f..%2fetc%2fpasswd', '/media/Channel%20A/.hidden.mp4', '/media/.stfolder/x.mp4']) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});

test('accepts log notes from the page', async () => {
  const r = await fetch(base + '/api/log', { method: 'POST', body: JSON.stringify({ event: 'test', detail: 'hello' }) });
  assert.strictEqual(r.status, 204);
});

test('cleanTitle strips ids, series/episode numbers and dates', () => {
  assert.strictEqual(cleanTitle('s2024e1105 - My Video [dQw4w9WgXcQ]'), 'My Video');
  assert.strictEqual(cleanTitle('2024-11-05 Another one'), 'Another one');
  assert.strictEqual(cleanTitle('S2026E110501 - Upper case [abcdefghijk]'), 'Upper case');
  assert.strictEqual(cleanTitle('s2026e1105 No dash'), 'No dash');
  assert.strictEqual(cleanTitle('s2026e092799 - Some video [dQw4w9WgXcQ]'), 'Some video');
  assert.strictEqual(cleanTitle('s2026e092799_Some video'), 'Some video');
  assert.strictEqual(cleanTitle('Some_video_s2026e092799'), 'Some video');
  assert.strictEqual(cleanTitle('Show - S01E05 - The Thing'), 'Show - The Thing');
  assert.strictEqual(cleanTitle('Season 2 Episode 3 - Ending'), 'Ending');
  assert.strictEqual(cleanTitle('Top 10 cars of 2024 (part 2)'), 'Top 10 cars of 2024 (part 2)');
});
