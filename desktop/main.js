// City Thief for Windows (PC): the same game in its own window, works offline.
// The game files sit next to this file in "game/" and are served from app://game/ so that
// modern browser features (modules, saving progress) work exactly like on the website.
const { app, BrowserWindow, protocol, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.txt': 'text/plain', '.ico': 'image/x-icon',
};
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

app.whenReady().then(() => {
  const root = path.join(__dirname, 'game');
  protocol.handle('app', async (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) return new Response('Not allowed', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) { return new Response('Not found', { status: 404 }); }
  });
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 800, minHeight: 450, backgroundColor: '#07080a', title: 'City Thief',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' CityThiefApp/8 Windows');
  win.once('ready-to-show', () => { win.show(); win.maximize(); });
  // F11 = full screen, like a normal PC game.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // Links to websites open in the normal browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://game/index.html');
});
app.on('window-all-closed', () => app.quit());
