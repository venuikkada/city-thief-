# City Thief on Android and PC (v9)

The same game runs everywhere: on the website, as an Android app, and as a Windows PC program.
Built by Venu Brushwood.

## Android phone

**Install the app (APK)**
1. On the phone, open the website and tap **ANDROID APP (APK)** on the main menu
   (or open `https://<site>/download/CityThief.apk`).
2. Android asks for permission: **Settings -> Allow from this source** (for Chrome or WhatsApp), then **Install**.
3. Open **City Thief**. It is full screen and landscape, and it works **without internet** (the whole game is inside).

Notes
- Needs Android 7 or newer and a phone with OpenGL ES 3 (almost every phone from 2016 onwards).
- Voices: the phone's own Google voice in **English (India)**. If you hear no voice: Settings -> System ->
  Languages -> Text-to-speech -> Google -> install "English (India)".
- Back button = pause. On the main menu the back button closes the game.
- Progress is saved inside the app (separate from the website).
- Updates: install the new APK over the old one. It must be signed with the same key, so keep the key file safe
  (`tools/build-android.sh` makes one the first time; never put it on GitHub).

**Without installing:** open the website in Chrome and tap **INSTALL APP** (or Chrome menu -> Add to Home screen).

**Play Store (later):** Google Play only accepts an **App Bundle (.aab)** for new apps, signed with Play App Signing.
The APK here is for direct sharing (WhatsApp, Telegram, your website). For the Play Store, build an .aab with Android
Studio (or a Trusted Web Activity with Bubblewrap) from the website - plan about ₹2,200 for the one-time Google Play
developer account and 12 testers for 14 days (closed test) before the public launch.

## Windows PC

**Option 1 - easiest (Chrome or Edge):** open the website, click **INSTALL APP** on the main menu (or the install
icon in the address bar). It gets its own window and desktop icon, starts from the Start menu, and works offline after
the first visit. Updates arrive automatically.

**Option 2 - download:** click **WINDOWS PC (ZIP)** on the main menu, unzip `CityThief-Windows.zip`, open the folder and
double-click **CityThief.exe**. The first time Windows may say "Windows protected your PC" (new programs that are not
code-signed yet): click **More info -> Run anyway**. F11 = full screen.

**PC controls**

| Key | On foot | In a car |
|---|---|---|
| W A S D / arrows | move | drive / brake / steer |
| Mouse | look around | look around |
| Left click / Right click (hold) | fire / aim down the sights (rifle: sniper scope) | fire from the window |
| Shift | sprint | nitro boost |
| Space | jump | handbrake (drift) |
| E | get in a car | get out |
| R / C | reload / crouch | - |
| 1 / 2, mouse wheel, Q | main gun / pistol / switch | same |
| Y / U / I / O / H | talk / rob (in a shop: rob the till) / buy / push / hire | H = horn |
| K / T / G | photo / takedown / pick up | - |
| M / V / Esc / F11 | map / car camera / pause / full screen | same |
| 1 / 2 (when a question shows) | pick a choice (quiet or loud) | - |

## How the apps are built (for developers)

| App | Source | Build command |
|---|---|---|
| Website + offline cache | `web-demo/` | `python3 tools/make-sw.py` (refreshes `sw.js`), then upload `web-demo/` |
| Android APK | `android/` (a full-screen WebView that serves the game from inside the app + a text-to-speech bridge) | `CT_KS_PASS=... tools/build-android.sh <out> <keystore.jks>` (Ubuntu android-sdk packages, no Gradle) |
| Windows | `desktop/` (Electron window that serves the game from `app://game/`) | `node tools/build-windows.js <electron-win32-x64.zip> <out>` (needs `npm i resedit@1.7.2`) |
