# CITY THIEF (working title)

A 3D third-person open-world crime action game for Android phones.
Vikram, a small-time thief, escapes the police across a made-up city:
first on foot, then by car, bike, boat, and finally between two cities.

- Fictional city: **Navapur** (City 1) and **Sagarpet** (City 2, harbour city)
- Fictional police: **Navapur Metro Police (NMP)**
- No real brands, logos, maps, or real gun names anywhere.

---

## Engine: Unity 6 LTS + URP (Universal Render Pipeline)

Why Unity:

| Need | Why Unity fits |
|---|---|
| Android first, low-end phones | Most Indian mobile games are made in Unity. Best Android tools and phone support. |
| 30 FPS on 4 GB phones | URP is built for phones: cheap lights, baked lighting, LOD and culling built in. |
| APK under 150 MB | Texture compression (ASTC), code stripping, and Android App Bundle splits. |
| Touch controls | uGUI and the Input System handle multi-touch well. |
| Offline, no login | Nothing online is needed. Settings save on the phone. |
| Rewarded ads later | Unity LevelPlay / Google AdMob plugins are ready to use. |
| Help when stuck | Huge number of tutorials and answers, many in Hindi and Telugu on YouTube. |

Why not the others: **Unreal** makes APKs that are too big and runs too heavy for 4 GB phones.
**Godot** is free and lighter, but its Android 3D performance and ad plugins are less mature.

Cost: Unity Personal is free until your game earns about $200k (about ₹1.7 crore) a year.

---

## Browser demo (for sharing and feedback)

`web-demo/` is a playable **web version** built with Three.js:
- **Story:** Chapter 1 (5 missions with timers, win/fail, coins + stars, cutscenes with Ravi) and Free Roam.
- **Combat:** realistic animated people, pistol + SMG (aim, fire, reload, switch), police who arrest at 1 star and shoot at 2+, 5-star wanted level.
- **Cars and city:** steal any car (even police SUVs) and drive with drift/handbrake; street life (chai stall, street dancer, bus stop, fruit cart, crowds that flee); Indian street detail.
- **Settings:** sensitivity, button size, difficulty, graphics level, sound.

The **Unity project stays the real game** - the demo is for feedback and promotion.

- Live (temporary Hostinger domain): https://worldly-mediumturquoise-anteater-68.hostingersite.com
- Run locally: `cd web-demo && python3 -m http.server 8000`, then open http://localhost:8000
- Quality: auto (phones = medium, 4 GB phones = low, computers = high). Force with `?low`, `?medium`, `?high`.
- Code: `web-demo/src/`; third-party asset credits: `web-demo/assets/CREDITS.txt`.
- Deploy target is saved in `.hostinger/site.json`.

---

## Folder structure

```
city-thief-/                      <- Unity project root (this repo)
├── Assets/
│   └── _CityThief/               <- ALL our game files (underscore keeps it at the top)
│       ├── Scripts/
│       │   ├── Core/             settings, game start-up, save data
│       │   ├── Controls/         joystick, look zone, buttons, input hub   (Step 1)
│       │   ├── Player/           Vikram's movement + animation link        (Step 1)
│       │   ├── CameraSystem/     third-person camera                       (Step 1)
│       │   ├── HUD/              on-screen info (FPS, mini-map, stars)     (Step 1+)
│       │   ├── Traffic/          traffic cars and pedestrians              (Step 2)
│       │   ├── Police/           police AI, roadblocks, spike strips      (Step 2, 4)
│       │   ├── Vehicles/         cars, bikes, boat, helicopter             (Step 3, 6)
│       │   ├── Weapons/          shooting, reload, weapon switch           (Step 4)
│       │   ├── Wanted/           5-star wanted system                      (Step 4)
│       │   ├── Missions/         40 missions, objectives, rewards          (Step 5)
│       │   ├── Cutscenes/        in-engine cutscenes + subtitles           (Step 5)
│       │   ├── Garage/           buy and upgrade cars, coins               (Step 7)
│       │   ├── Audio/            engine, guns, sirens, music manager       (Step 7)
│       │   └── Environment/      day/night, rain                           (Step 7-8)
│       ├── Editor/               one-click scene builders + shared BuilderUtils (not in APK)
│       ├── Scenes/
│       ├── Prefabs/
│       ├── Art/ (Models, Materials, Textures, Animations)
│       ├── Audio/ (Music, SFX)
│       ├── Resources/
│       └── Localization/         Hindi / Telugu labels later
├── Docs/
│   ├── GAME_PLAN.md              story, chapters, wanted system, vehicles
│   ├── STEP1_REVIEW.md           how to test Step 1 + checklist
│   └── STEP2_REVIEW.md           how to test Step 2 + checklist
└── README.md
```

---

## Setup (one time)

1. Install **Unity Hub**, then **Unity 6 LTS** (6000.0 or newer LTS).
   Tick **Android Build Support** (with OpenJDK and Android SDK & NDK).
2. In Unity Hub: **New project** -> template **Universal 3D** -> name it `CityThief` -> Create.
3. Close Unity. Copy everything from this repo (including the hidden `.git` folder and `.gitignore`)
   into that new `CityThief` folder. Now the Unity project and this repo are the same folder.
4. Open the project again in Unity Hub.
5. **File -> Build Profiles** (or Build Settings) -> choose **Android** -> **Switch Platform**.
6. **Edit -> Project Settings -> Player -> Resolution and Presentation** -> Default Orientation:
   **Auto Rotation**, allow only the two Landscape options.

After the first open, Unity makes `ProjectSettings/`, `Packages/` and `.meta` files.
Commit those too, so the project opens the same way on any computer.

---

## Build order (each step is sent for review)

| Step | What | Status |
|---|---|---|
| 1 | Core movement and camera on foot (joystick + drag-to-look) | Done |
| 2 | One city block with traffic and police | **Done - ready for review** |
| 3 | Car driving with PUBG-style vehicle controls | Next |
| 4 | Shooting and wanted stars | |
| 5 | Missions 1-10 (Chapter 1) | |
| 6 | Bike, then boat, then highway (Chapters 2-4) | |
| 7 | Garage, menus, settings, and sound | |
| 8 | Optimisation and APK build | |

How to test each step: `Docs/STEP1_REVIEW.md`, `Docs/STEP2_REVIEW.md`.
