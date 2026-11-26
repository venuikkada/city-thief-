#!/usr/bin/env python3
"""Writes web-demo/sw.js: the offline cache for the game (run it before every deploy).

Code (html/js/css) is fetched fresh when online (so updates show at once) and comes from the
cache when offline. Big files (3D models, sky, textures) come from the cache first.
"""
import hashlib, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web-demo')
SKIP = {'sw.js', '.htaccess'}
files, h = [], hashlib.sha1()
for d, _, names in os.walk(ROOT):
    rel_d = os.path.relpath(d, ROOT)
    if rel_d.startswith('download'):
        continue
    for n in sorted(names):
        if n in SKIP or n.startswith('.'):
            continue
        rel = os.path.normpath(os.path.join(rel_d, n)).replace(os.sep, '/')
        files.append('./' + rel)
        with open(os.path.join(d, n), 'rb') as f:
            h.update(f.read())
files.sort()
version = h.hexdigest()[:10]
js = """// City Thief offline cache (made by tools/make-sw.py - do not edit by hand).
const CACHE = 'citythief-%s';
const FILES = %s;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const CODE = /\\.(html|js|css|webmanifest)$/;
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isCode = req.mode === 'navigate' || CODE.test(url.pathname);
  if (isCode) {
    // Fresh when online, cached when offline.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
  }
});
""" % (version, '[\n  ' + ',\n  '.join("'%s'" % f for f in files) + '\n]')
with open(os.path.join(ROOT, 'sw.js'), 'w') as f:
    f.write(js)
print('sw.js:', len(files), 'files, version', version)
