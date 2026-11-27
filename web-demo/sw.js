// City Thief offline cache (made by tools/make-sw.py - do not edit by hand).
const CACHE = 'citythief-34dfffc9ff';
const FILES = [
  './assets/CREDITS.txt',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-32.png',
  './assets/icons/icon-512.png',
  './assets/people/anim_f.glb',
  './assets/people/anim_m.glb',
  './assets/people/f_coat.glb',
  './assets/people/f_green.glb',
  './assets/people/f_grey.glb',
  './assets/people/f_pink.glb',
  './assets/people/f_purple.glb',
  './assets/people/f_salwar.glb',
  './assets/people/f_sporty.glb',
  './assets/people/m_delivery.glb',
  './assets/people/m_denim.glb',
  './assets/people/m_hoodie.glb',
  './assets/people/m_jacket.glb',
  './assets/people/m_kurta.glb',
  './assets/people/m_office.glb',
  './assets/people/m_red.glb',
  './assets/people/m_sweater.glb',
  './assets/people/m_tee.glb',
  './assets/people/m_worker.glb',
  './assets/people/police.glb',
  './assets/people/ravi.glb',
  './assets/people/swat.glb',
  './assets/people/vikram.glb',
  './assets/sky/sunset_1k.hdr',
  './assets/tex/waternormals.jpg',
  './css/game.css',
  './index.html',
  './js/vendor/THREE-LICENSE.txt',
  './js/vendor/addons/libs/meshopt_decoder.module.js',
  './js/vendor/addons/loaders/GLTFLoader.js',
  './js/vendor/addons/loaders/RGBELoader.js',
  './js/vendor/addons/postprocessing/EffectComposer.js',
  './js/vendor/addons/postprocessing/MaskPass.js',
  './js/vendor/addons/postprocessing/OutputPass.js',
  './js/vendor/addons/postprocessing/Pass.js',
  './js/vendor/addons/postprocessing/RenderPass.js',
  './js/vendor/addons/postprocessing/ShaderPass.js',
  './js/vendor/addons/postprocessing/UnrealBloomPass.js',
  './js/vendor/addons/shaders/CopyShader.js',
  './js/vendor/addons/shaders/LuminosityHighPassShader.js',
  './js/vendor/addons/shaders/OutputShader.js',
  './js/vendor/addons/utils/BufferGeometryUtils.js',
  './js/vendor/addons/utils/SkeletonUtils.js',
  './js/vendor/three.module.min.js',
  './manifest.webmanifest',
  './src/acts.js',
  './src/ambience.js',
  './src/ambient.js',
  './src/atmosphere.js',
  './src/audio.js',
  './src/characters.js',
  './src/controls.js',
  './src/driving.js',
  './src/hud.js',
  './src/i18n.js',
  './src/interact.js',
  './src/interiors.js',
  './src/layout.js',
  './src/main.js',
  './src/mcars.js',
  './src/mesh.js',
  './src/missions.js',
  './src/missions2.js',
  './src/mkit.js',
  './src/music.js',
  './src/nav.js',
  './src/player.js',
  './src/police.js',
  './src/rewards.js',
  './src/sky.js',
  './src/specials.js',
  './src/stunts.js',
  './src/textures.js',
  './src/traffic.js',
  './src/util.js',
  './src/vehicles.js',
  './src/voice.js',
  './src/weapons.js',
  './src/world.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const CODE = /\.(html|js|css|webmanifest)$/;
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
