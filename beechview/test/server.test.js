'use strict';
// End-to-end test against a throwaway library that mimics Pinchflat's layout.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const http = require('http');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beechview-'));
// The work folder sits inside the normal shows folder, as on the real setup.
const workRoot = path.join(root, 'Work');
// Same file Home Assistant would write from the Configuration tab.
const options = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beechview-opts-')), 'options.json');
fs.writeFileSync(options, JSON.stringify({
  media_path: root,
  rescan_seconds: 0,
  work_mode: true,
  work_entities: ['binary_sensor.boot_room_working_day', 'schedule.work_schedule'],
  work_media_path: workRoot,
}));
process.env.BEECHVIEW_OPTIONS = options;
const { createServer, cleanTitle, checkWorkMode } = require('../server');

// A fake Home Assistant API: entity states can be changed by the tests.
const haStates = { 'binary_sensor.boot_room_working_day': 'off', 'schedule.work_schedule': 'off' };
const ha = http.createServer((req, res) => {
  const id = decodeURIComponent(req.url.replace('/api/states/', ''));
  if (!(id in haStates)) { res.writeHead(404); return res.end('{}'); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ entity_id: id, state: haStates[id] }));
});

fs.mkdirSync(path.join(workRoot, 'Work Channel'), { recursive: true });
fs.writeFileSync(path.join(workRoot, 'Work Channel', 's2026e092799_Spreadsheets.mp4'), Buffer.alloc(100, 3));

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
  ha.listen(0, '127.0.0.1', () => {
    process.env.BEECHVIEW_HA_URL = `http://127.0.0.1:${ha.address().port}/api`;
    server = createServer().listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      r();
    });
  });
}));
test.after(() => {
  server.close();
  ha.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.rmSync(path.dirname(options), { recursive: true, force: true });
});

test('lists each folder as a show, most recently updated first', async () => {
  const { shows } = await (await fetch(base + '/api/shows')).json();
  // "Work" is the work folder, so it is not a normal channel.
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

test('work mode: work videos only while every work entity is on', async () => {
  const shows = async () => (await fetch(base + '/api/shows')).json();

  await checkWorkMode();
  let data = await shows();
  assert.strictEqual(data.mode, 'normal');

  haStates['binary_sensor.boot_room_working_day'] = 'on';
  await checkWorkMode();
  assert.strictEqual((await shows()).mode, 'normal', 'one entity on is not enough');

  haStates['schedule.work_schedule'] = 'on';
  await checkWorkMode();
  await (await fetch(base + '/api/shows?refresh=1')).json(); // first scan of the work folder
  data = await shows();
  assert.strictEqual(data.mode, 'work');
  assert.deepStrictEqual(data.shows.map((s) => s.name), ['Work Channel']);

  const show = await (await fetch(base + '/api/shows/Work%20Channel')).json();
  assert.strictEqual(show.mode, 'work');
  assert.strictEqual(show.episodes[0].title, 'Spreadsheets');
  assert.ok(show.episodes[0].id.startsWith('work~'), 'work progress is kept separate');
  assert.ok(show.episodes[0].src.startsWith('work-media/'));
  const video = await fetch(base + '/' + show.episodes[0].src, { headers: { Range: 'bytes=0-9' } });
  assert.strictEqual(video.status, 206);

  // A channel from the normal library still opens (e.g. it was on screen).
  assert.strictEqual((await fetch(base + '/api/shows/Channel%20A')).status, 200);

  haStates['schedule.work_schedule'] = 'off';
  await checkWorkMode();
  assert.strictEqual((await shows()).mode, 'normal');
});

test('work mode: an unknown entity means normal videos', async () => {
  haStates['schedule.work_schedule'] = 'on';
  haStates['binary_sensor.boot_room_working_day'] = 'on';
  await checkWorkMode();
  assert.strictEqual((await (await fetch(base + '/api/shows')).json()).mode, 'work');
  delete haStates['schedule.work_schedule'];
  await checkWorkMode();
  assert.strictEqual((await (await fetch(base + '/api/shows')).json()).mode, 'normal');
});
