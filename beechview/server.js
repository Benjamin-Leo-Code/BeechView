'use strict';

// BeechView – a tiny, dependency-free media server for a folder of shows.
// Every top-level folder inside MEDIA_ROOT is a "show"; every video file found
// anywhere beneath it (any depth) is an "episode". The library is re-scanned on
// demand, so newly added folders appear as new shows automatically.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// When run as a Home Assistant app, settings come from /data/options.json.
function haOptions() {
  try {
    return JSON.parse(fs.readFileSync(process.env.HA_OPTIONS || '/data/options.json', 'utf8'));
  } catch {
    return {};
  }
}
const OPTIONS = haOptions();

const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || OPTIONS.media_path || '/media');
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const SCAN_TTL_MS = parseInt(process.env.SCAN_TTL_SECONDS || OPTIONS.rescan_seconds || '15', 10) * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv']);
// Formats Safari / WebKit can play natively.
const SAFARI_EXT = new Set(['.mp4', '.m4v', '.mov']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.vtt': 'text/vtt; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const SHOW_ART = ['poster', 'folder', 'cover', 'show', 'fanart', 'banner'];

// ---------------------------------------------------------------------------
// Library scanning
// ---------------------------------------------------------------------------

const hidden = (name) => name.startsWith('.') || name.startsWith('@') || name === '#recycle';

const toUrlPath = (rel) => rel.split(path.sep).map(encodeURIComponent).join('/');
// Relative URL, so it also works behind Home Assistant's ingress prefix.
const mediaUrl = (rel) => 'media/' + toUrlPath(rel);

async function walk(dir, depth = 0, out = []) {
  if (depth > 6) return out;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (hidden(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, depth + 1, out);
    else if (e.isFile() || e.isSymbolicLink()) out.push(full);
  }
  return out;
}

// Turn "s2024e1105 - My Video [dQw4w9WgXcQ]" into "My Video": drop the video
// id, any series/episode numbering (s2024e1105, S01E05, S1 E5, Season 1
// Episode 5, 1x05) and leading dates, then tidy up leftover separators.
const SEP = '[\\s._|:\\-–—]';
function cleanTitle(base) {
  const t = base
    .replace(/\s*\[[A-Za-z0-9_-]{6,}\]\s*$/, '')
    .replace(/\s*\([A-Za-z0-9_-]{11}\)\s*$/, '')
    // Not "\b": an underscore counts as part of a word, so s2026e092799_Title
    // would be missed. Only refuse letters/digits directly around the number.
    .replace(/(?<![a-z0-9])S(?:eason)?[\s._-]*\d{1,4}[\s._-]*E(?:p(?:isode)?)?[\s._-]*\d{1,6}(?![a-z0-9])/gi, ' - ')
    .replace(/(?<![a-z0-9])\d{1,2}x\d{2,3}(?![a-z0-9])/gi, ' - ')
    .replace(/^\s*\d{4}-\d{2}-\d{2}\b/, ' - ')
    .replace(/^\s*\d{8}\b/, ' - ')
    .replace(/_+/g, ' ')
    .replace(new RegExp(`^${SEP}+`), '')
    .replace(/[\s|:\-–—]+$/, '')
    .replace(/\s+[-–—|]\s+(?:[-–—|]\s+)+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t || base;
}

function findDate(text) {
  // Pinchflat's "season from date" numbering: s2024e1105 = 5 Nov 2024.
  let m = text.match(/(?<![a-z0-9])s(20\d{2})e(\d{2})(\d{2})\d{0,2}(?!\d)/i);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

async function scanShow(name) {
  const showDir = path.join(MEDIA_ROOT, name);
  const files = await walk(showDir);
  const fileSet = new Set(files);
  const episodes = [];
  let latest = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      continue;
    }
    // Skip partial downloads.
    if (/\.(part|ytdl|tmp)$/i.test(file) || stat.size === 0) continue;

    const dir = path.dirname(file);
    const base = path.basename(file, path.extname(file));
    let thumb = null;
    for (const suffix of ['-thumb', '', '.thumb', '-poster']) {
      for (const ie of IMAGE_EXT) {
        const candidate = path.join(dir, base + suffix + ie);
        if (fileSet.has(candidate)) {
          thumb = candidate;
          break;
        }
      }
      if (thumb) break;
    }
    let subtitles = null;
    for (const f of fileSet) {
      if (f.startsWith(path.join(dir, base)) && f.toLowerCase().endsWith('.vtt')) {
        subtitles = f;
        break;
      }
    }

    const rel = path.relative(MEDIA_ROOT, file);
    const relInShow = path.relative(showDir, file);
    latest = Math.max(latest, stat.mtimeMs);
    episodes.push({
      id: toUrlPath(rel),
      title: cleanTitle(base),
      date: findDate(relInShow),
      sortKey: relInShow.toLowerCase(),
      size: stat.size,
      added: stat.mtimeMs,
      playable: SAFARI_EXT.has(ext),
      src: mediaUrl(rel),
      thumb: thumb ? mediaUrl(path.relative(MEDIA_ROOT, thumb)) : null,
      subtitles: subtitles ? mediaUrl(path.relative(MEDIA_ROOT, subtitles)) : null,
    });
  }

  // Newest first. Pinchflat names files with dates / season-episode numbers,
  // so a reverse natural sort on the relative path puts the latest at the top.
  episodes.sort((a, b) =>
    b.sortKey.localeCompare(a.sortKey, undefined, { numeric: true }) || b.added - a.added);
  episodes.forEach((e) => delete e.sortKey);

  // Show artwork: poster.jpg / folder.jpg etc. at the top of the show folder,
  // otherwise fall back to the newest episode's thumbnail.
  let poster = null;
  outer: for (const n of SHOW_ART) {
    for (const ie of IMAGE_EXT) {
      const candidate = path.join(showDir, n + ie);
      if (fileSet.has(candidate)) {
        poster = mediaUrl(path.relative(MEDIA_ROOT, candidate));
        break outer;
      }
    }
  }
  if (!poster) poster = (episodes.find((e) => e.thumb) || {}).thumb || null;

  return { id: encodeURIComponent(name), name, poster, latest, episodes };
}

let cache = { at: 0, data: null, pending: null };

function runScan() {
  if (!cache.pending) {
    const started = Date.now();
    cache.pending = (async () => {
      let entries = [];
      try {
        entries = await fsp.readdir(MEDIA_ROOT, { withFileTypes: true });
      } catch (err) {
        console.error(`Cannot read MEDIA_ROOT ${MEDIA_ROOT}: ${err.message}`);
      }
      const dirs = entries.filter((e) => e.isDirectory() && !hidden(e.name)).map((e) => e.name);
      // A few shows at a time, so a rescan of a network share doesn't hog the
      // disk/network and slow down thumbnails and video for whoever is watching.
      const shows = [];
      let next = 0;
      const worker = async () => {
        while (next < dirs.length) shows.push(await scanShow(dirs[next++]));
      };
      await Promise.all([worker(), worker(), worker()]);
      // Most recently updated show (newest video) first.
      shows.sort((a, b) => b.latest - a.latest ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      const firstScan = !cache.data;
      cache.at = Date.now();
      cache.data = shows;
      if (firstScan) console.log(`Found ${shows.length} shows in ${((cache.at - started) / 1000).toFixed(1)} s`);
      return shows;
    })().finally(() => {
      cache.pending = null;
    });
  }
  return cache.pending;
}

// Scanning a network share can be slow, so once a scan exists, answer from it
// straight away and refresh it in the background when it is out of date.
// Only the very first scan, or a forced one (the refresh button), is waited for.
async function scanLibrary(force = false) {
  if (force || !cache.data || SCAN_TTL_MS === 0) return runScan();
  if (Date.now() - cache.at >= SCAN_TTL_MS) runScan().catch((err) => console.error(err));
  return cache.data;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function sendError(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

// Resolve a URL path to a file inside `root`, refusing anything outside it.
function safeResolve(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (full.split(path.sep).some((part) => part && hidden(part) && part !== '.')) return null;
  return full;
}

async function sendFile(req, res, file, { cache: cacheControl = 'no-cache', allowed } = {}) {
  const ext = path.extname(file).toLowerCase();
  if (allowed && !allowed.has(ext)) return sendError(res, 404, 'Not found');
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return sendError(res, 404, 'Not found');
  }
  if (!stat.isFile()) return sendError(res, 404, 'Not found');

  const size = stat.size;
  const etag = `"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'Cache-Control': cacheControl,
  };

  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.writeHead(304, headers);
    return res.end();
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    if (m[1] === '') {
      // Suffix range: last N bytes.
      start = Math.max(0, size - parseInt(m[2], 10));
    } else {
      start = parseInt(m[1], 10);
      if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
    }
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();

  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const MEDIA_ALLOWED = new Set([...VIDEO_EXT, ...IMAGE_EXT, '.vtt']);

// Notes from the page (reloads, errors, screens), written to the log so they
// show up in Home Assistant's Log tab. Small and plain text only.
function logFromClient(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 2048) req.destroy();
  });
  req.on('end', () => {
    try {
      const { event, detail } = JSON.parse(body);
      const clean = (v) => String(v || '').replace(/[^\x20-\x7e\u00a0-\uffff]/g, ' ').slice(0, 300);
      const who = (req.headers['user-agent'] || '').match(/\(([^;)]+)/);
      console.log(`[page${who ? ' ' + who[1] : ''}] ${clean(event)}${detail ? ': ' + clean(detail) : ''}`);
    } catch {
      /* ignore malformed notes */
    }
    res.writeHead(204);
    res.end();
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  if (req.method === 'POST' && p === '/api/log') return logFromClient(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed');

  if (p === '/api/health') return sendJson(res, 200, { ok: true, mediaRoot: MEDIA_ROOT });

  if (p === '/api/shows') {
    const shows = await scanLibrary(url.searchParams.has('refresh'));
    return sendJson(res, 200, {
      shows: shows.map(({ episodes, ...s }) => ({
        ...s,
        episodeCount: episodes.length,
      })),
    });
  }

  if (p.startsWith('/api/shows/')) {
    const id = p.slice('/api/shows/'.length);
    const shows = await scanLibrary(url.searchParams.has('refresh'));
    const show = shows.find((s) => s.id === id || s.name === safeDecode(id));
    if (!show) return sendJson(res, 404, { error: 'Show not found' });
    return sendJson(res, 200, show);
  }

  if (p.startsWith('/media/')) {
    const file = safeResolve(MEDIA_ROOT, p.slice('/media/'.length));
    if (!file) return sendError(res, 404, 'Not found');
    const isImage = IMAGE_EXT.has(path.extname(file).toLowerCase());
    return sendFile(req, res, file, {
      allowed: MEDIA_ALLOWED,
      cache: isImage ? 'public, max-age=86400' : 'no-cache',
    });
  }

  // Static front-end.
  const rel = p === '/' ? 'index.html' : p.slice(1);
  const file = safeResolve(PUBLIC_DIR, rel);
  if (!file) return sendError(res, 404, 'Not found');
  return sendFile(req, res, file);
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      sendError(res, 500, 'Server error');
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`BeechView listening on http://${HOST}:${PORT}`);
    console.log(`Serving shows from ${MEDIA_ROOT}`);
    // Scan straight away so the first visit doesn't have to wait for it.
    scanLibrary(true).catch((err) => console.error(err));
  });
}

module.exports = { createServer, scanLibrary, cleanTitle };
