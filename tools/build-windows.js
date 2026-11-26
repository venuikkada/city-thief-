#!/usr/bin/env node
// Builds the Windows PC version: CityThief-Windows.zip (CityThief.exe + the game, works offline).
// Usage: node tools/build-windows.js <electron-vXX-win32-x64.zip> <output-folder>
// Needs: npm install resedit@1.7.2 (sets the icon and the program name inside CityThief.exe).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ResEdit = require('resedit');
const [, , electronZip, outDir] = process.argv;
const repo = path.join(__dirname, '..');
const dist = path.join(outDir, 'CityThief');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
execSync(`unzip -q "${electronZip}" -d "${dist}"`);
fs.renameSync(path.join(dist, 'electron.exe'), path.join(dist, 'CityThief.exe'));
fs.rmSync(path.join(dist, 'resources', 'default_app.asar'), { force: true });
// The app: main.js + package.json + icon + the game files.
const appDir = path.join(dist, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const f of ['main.js', 'package.json']) fs.copyFileSync(path.join(repo, 'desktop', f), path.join(appDir, f));
fs.copyFileSync(path.join(repo, 'web-demo', 'assets', 'icons', 'icon-512.png'), path.join(appDir, 'icon.png'));
fs.cpSync(path.join(repo, 'web-demo'), path.join(appDir, 'game'), { recursive: true, filter: (src) => !/[\\/]download([\\/]|$)/.test(src) && !src.endsWith('.htaccess') });
// Icon + name inside CityThief.exe (no Windows tools needed).
const exePath = path.join(dist, 'CityThief.exe');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(repo, 'desktop', 'icon.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, glang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, glang, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
vi.setStringValues(lang, { ProductName: 'City Thief', FileDescription: 'City Thief', CompanyName: 'Venu Brushwood', InternalName: 'CityThief', OriginalFilename: 'CityThief.exe', LegalCopyright: 'Built by Venu Brushwood' });
vi.setFileVersion(8, 0, 0, 0, lang.lang); vi.setProductVersion(8, 0, 0, 0, lang.lang);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
fs.writeFileSync(path.join(dist, 'HOW TO PLAY.txt'), [
  'CITY THIEF for Windows - built by Venu Brushwood', '',
  '1. Double-click CityThief.exe (keep all the files in this folder together).',
  '2. If Windows says "Windows protected your PC": click "More info" then "Run anyway".',
  '   (This appears for new games that are not signed yet. The game is safe.)',
  '3. Click the game to use the mouse. Press F11 for full screen, Esc to pause.', '',
  'Keys: W A S D move/drive, Mouse look, Left click fire, Right click aim, Shift sprint/nitro,',
  'Space jump/handbrake, E get in/out of a car, R reload, Q switch gun, C crouch,',
  'Y talk, U rob, O push, H hire/horn, K photo, T takedown, G pick up, M map, V car camera.', '',
].join('\r\n'));
const zip = path.join(outDir, 'CityThief-Windows.zip');
fs.rmSync(zip, { force: true });
execSync(`cd "${outDir}" && zip -qr -9 "CityThief-Windows.zip" CityThief`);
console.log('built', zip, Math.round(fs.statSync(zip).size / 1e6) + ' MB');
