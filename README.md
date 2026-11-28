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
- **Big city:** Navapur is 6 x 6 blocks (about 0.5 km x 0.5 km) in districts: old town, downtown glass towers,
  parks with fountains, bazaars, and a Marine-Drive-style seafront (palm promenade, art-deco hotels with neon signs,
  beach and sea). Traffic and people follow you around the city, so it always feels busy.
- **Real people:** motion-captured humans (Vikram, Ravi, police, SWAT and 17 city people) who walk, run, sit on
  benches, drink chai, talk on phones, dance, cheer, shop at the bazaar, and run away from gunfire.
- **Story: 76 missions in 8 chapters** - escapes, a street race, chases where the target car explodes,
  a cash hunt, a speed-bomb van (jump it into the sea), boss fights (Kaali, Inspector Rana), tailing a car,
  stealing a police SUV, gang waves, a drift challenge, a getaway-driver job, a stunt courier, a stealth
  mission with silent takedowns, a bomb squad, the big gold heist with a boat escape.
- **Chapter 3 "Navapur Nights" (new, 6 missions nobody has done in a crime game):**
  - **Go Live** - your crime spree is live-streamed: viewers, hype, chat, and chat VOTES give you challenges. Reach 1 million viewers.
  - **Holi Hai!** - steal a golden pichkari at the Holi festival; throw gulal clouds the police cannot see through.
  - **60 Seconds** - a time loop: the night restarts every minute; remember the code and the guard's chai break to crack the vault.
  - **Blackout** - the city power is cut; hunters with torches; switch 3 fuse boxes back on and watch the city light up.
  - **Monsoon** - a flood rises in the streets; drive a speedboat through the city to rescue Ravi.
  - **Baraat** - hide in a wedding procession and dance on the dhol beat (rhythm game) to pass police checkpoints.
- **Chapters 4-8 (50 more missions, built on research - see `Docs/MISSION_RESEARCH.md`):**
  - **4 Street Smart** - ask around the bazaar, pickpocket tourists, chase a purse snatcher on foot, hire a crew,
    serve chai undercover, drive a taxi, auto-rickshaw race, tail a tiffin man, defend the bazaar, boss Chhota Babu.
  - **5 Undercover** - delivery-boy / police / cleaner / waiter disguises (walk calmly or the guards notice),
    photos with a camera, copy a phone, escort a witness, chant at an election rally, boss Neta Bhanwar Lal.
  - **6 Fast and Desi** - steal cars for a buyer, city bus route, ambulance rescue, drag race, truck hijack,
    citywide gridlock escape, smash derby, blackout race, relief convoy, boss Collector Kapoor.
  - **7 Festival City** - Diwali bombs, kite-festival spy drones, garba, gully cricket, Ganpati visarjan,
    mela shooting gallery, Holi colour war, wedding infiltration, lantern run, boss Inspector Rana.
  - **8 King of Navapur** - the bank heist: photo recon, getaway cars, key card, quiet-or-loud choices, distraction bombs,
    heist day, five-star getaway, betrayal on the sea, final boss the Commissioner.
  - **"EARLIER..." flashback before every mission (all 76):** what Vikram did before the theft (scouting, meeting
    the crew, buying tools), with its own camera shots. Tap SKIP to jump straight in.
  - Plan for more missions: `Docs/MISSION_PLAN.md`.
- **v8: every mission is a 5+ minute job in THREE ACTS (and harder):**
  - **Act 1 THE PLAN** - meet the person with the job (they speak, Vikram answers), then two preparation jobs:
    buy gear at the market (no money? pickpocket someone), photograph the CCTV cameras, take out the lookouts quietly,
    raise cash by pickpocketing, chase a snitch, steal the right car, hire a crew member, tune the car at the garage.
  - **Act 2 THE JOB** - the mission itself, tougher: enemies take 35% more hits (bosses 50%) and hit 20% harder,
    guards notice you 25% faster, timers are 8% shorter.
  - **Act 3 THE GETAWAY** - police heat, lose them (they raid buildings too), take the loot to a safehouse
    (sometimes men are waiting there, or the safehouse is burned and you must reach a backup one), and report back.
  - **Checkpoints:** fail in act 2 or 3 and the result screen offers RETRY FROM ACT 2 / 3. A mission clock and the
    act show under the mission title. Rewards are 1.6x bigger. All of it is set per mission in `web-demo/src/acts.js`.
- **v9: shooting like the big mobile shooters, two gun slots, and you can walk into ANY building:**
  - **Aim and fire:** the crosshair opens up while you run, jump or spray, and closes when you stand still, crouch or
    aim (ADS). Every gun kicks up (recoil) and most of the kick comes back when you stop firing. Hit markers (gold for a
    headshot, red for a kill), damage numbers, a kill feed, shell casings and bullet holes in the walls.
  - **Scopes:** the SMG and pistols aim down a red-dot / iron sight with a small zoom; the RIFLE has a real sniper
    scope (first-person view, mil-dot reticle, 2.5x zoom).
  - **Two gun slots (bottom middle, like PUBG):** slot 1 = main gun (SMG, shotgun or rifle), slot 2 = pistol. Tap a slot
    to switch at any time (on foot or in a car); tap it again to swap to another gun of the same kind. The other gun
    rides on Vikram's back or in the hip holster. PC: keys 1 / 2 or the mouse wheel.
  - **Every building has a real door:** 262 shops and 20 office towers. Glass doors slide open when someone walks up.
    Inside is the shop on the sign: phones, sweets, chai, hardware, a restaurant ("hotel"), medicines, saris (with a
    white gaddi), electricals, a general store, auto parts, a tailor, a fruit mart, or an office lobby with lifts.
    Each has a shopkeeper, customers, shelves full of goods and a cash drawer. BUY what the shop sells (first aid,
    food, ammo, a new SIM = -1 star, a new shirt = the police lose you at 1-2 stars) or ROB THE TILL (₹600 - ₹6,500,
    then the alarm = 2 stars, and the police come inside after you). Only the 3 nearest buildings are open at once
    (built in 2-8 ms from simple boxes: nothing extra to download).
- **v9.8: real sounds (they sounded artificial):** every sound made in code was replaced by a REAL RECORDING
  (88 clips, 1.5 MB, all CC0 from freesound.org - authors in `web-demo/assets/sfx/CREDITS.txt`): real guns
  (9mm pistol, AR-15, AK-47, a 20-gauge shotgun, a big hunting rifle for the sniper, a .22 magnum for the golden
  pistol) with their natural outdoor echo, distant shots for far-away police, reloads, a pump after every shotgun
  shot, the sniper's bolt, a dry-fire click, shells hitting the ground, ricochets, bullets whizzing past; real
  footsteps on stone, shop tiles, sand and water (and running steps); punches, swings, bodies falling; explosions,
  car crashes, tyres, car doors, horns, a recorded engine that revs with speed, a police siren, a helicopter;
  and the city: Mumbai traffic, an Indian street market, birds, crickets, sea waves, rain, thunder, crows, dogs,
  Hindu temple bells, police radio. A street-echo reverb, a little random pitch (no two shots the same) and
  left / right panning. The old made-in-code sounds still play until the files load. How the files were made: `tools/sfx/`
  (trim, clean, level, slice footsteps, seamless loops).
- **v10.1: every mission step by step, police timing, the mission box in your language:**
  - **One step after another:** every mission shows STEP n/N, what to do NOW and what comes NEXT. The whole plan
    (done ✓ / now / to do, by act: THE PLAN, THE JOB, THE GETAWAY) opens by itself a few seconds after the mission
    starts, and any time with the STEPS button (PC: J). On phones it opens as a card in the middle, so it never
    covers the FIRE / AIM buttons. In English Vikram says each new step ("Step 3. Now I need to ...").
  - **Police timing:** the FIRST time Vikram is wanted in a mission (or in free roam) the police come at once to
    catch him - a car close by joins the chase and for 20 s the control room guides them to him, so he cannot
    just walk off before they arrive. After that they take 4 MINUTES to come again (POLICE COMING IN 4:00); beat
    the cops who came and the breather is 4 minutes too. The 2-minute shield (no kill / no arrest) stays.
  - **Your language:** with Hindi, Telugu, Tamil, Kannada, Malayalam, Gujarati, Marathi, Bengali or Odia chosen,
    the mission box (what to do now, NEXT, the step list, the act names) is in that language, with names in that
    script ("రవి: వెళ్ళి అతనితో మాట్లాడాలి."). Reminders are text only in that language (no voice). Menus and story
    dialogue stay English. Each of the 379 different step texts maps to a task sentence (30 kinds in 9 languages).
- **v10.0: the police take 2 minutes to come:** new wanted stars no longer bring the police at once. The screen
  shows POLICE COMING IN 2:00 and counts down; nobody chases Vikram meanwhile (no police cars, roadblocks,
  helicopter or raids, and cops who happen to be around do nothing). Use the time: finish the job, grab a fast car,
  buy a NEW SIM (-1 star; this now really works) or a NEW SHIRT (1-2 stars: they lose you). Just running away does
  not lose them - at 0:00 they come to wherever he is, and for 15 s the control room guides them to him. Then the
  old 2-minute shield starts (they cannot kill or arrest him yet). A cop he attacks during the wait fights back
  at once (with the cops next to him). Scripted mission shoot-outs (the police are already there) and the CALL
  COPS button still bring them at once. In "Lose the police" mission steps the task shows the countdown too.
- **v9.9: a clean mix like GTA / PUBG (v9.8 had too much horn and crowd noise):** in a minute on a busy road you now
  hear about 2 horns instead of 32, and the background is about 11 dB quieter. The honking Mumbai-traffic loop and
  the street-market crowd loop are gone; under everything there is now soft open air and a far-away city wash
  (no horns in it) that grows near busy roads. The two nearest moving cars hum as they pass (left / right, near /
  far; autos buzz high, trucks rumble low). A car you stand in front of honks once every 4-8 s (not non-stop);
  all traffic horns together at most once every 2.5 s (your own horn always answers the button). Crows, dogs,
  temple bells and police radio are rarer and softer. Gunshots, explosions and people talking push the background
  down for a moment (ducking), so the action is always clear; footsteps are a bit louder and close shots have a
  little more low punch. Just walking around, the music plays at half volume (full in missions, chases, fights).
, a 2-minute police grace, prettier streets, a set piece in every mission:**
  - **Empty hands first:** Vikram starts with bare FISTS (FIRE = PUNCH) and his pistol in the holster. With empty
    hands he runs about 18% faster. Guns lie around the city (yellow light; 70 loot spots by the shop doors, fresh
    loot 3 minutes after you take it) and fallen cops / gangsters drop theirs: walk up and PICK UP (the button shows
    the gun's name). Slots 1 + 2 = main guns, slot 3 = pistol. Tap a slot to take that gun out, tap the gun in your
    hands to put it away. Both slots full? The new gun swaps with the one in your hands (it drops on the ground).
    A small gun kit lies next to Vikram at the start of every mission; SHOP guns always wait there.
  - **Guns (fictional names):** CHEETAH SMG, DHAMAAL 12 shotgun, TOOFAN AR, SHIKARI DMR (4X), GARUDA SNIPER (8X,
    bolt action), PISTOL, GOLDEN PISTOL. Heavier guns slow him a little.
  - **Real sights, first person (AIM):** every gun now aims DOWN ITS SIGHT like PUBG: iron sights (line up the ring /
    notch and the post), a RED DOT, or a 2X / 4X / 8X SCOPE (black lens, red chevron or mil-dot reticle, a little sway -
    crouch to steady it). Scopes lie around too (blue light) - walk over one and it goes on a gun it fits. The SIGHT
    button (PC: V) switches sights. Aiming is far more accurate (a scoped sniper is near perfect). PC: X = gun away,
    1 / 2 / 3 = slots.
  - **Police grace:** the first 2 minutes of any chase the police cannot kill or arrest Vikram (he keeps 12 health,
    a grab lasts until the 2 minutes are over) - time to fight back and take them all down. A blue shield timer shows it.
  - **Prettier city:** real grey roads (they were almost black), festival bunting across the old-town streets,
    balconies with painted railings and flower pots, sunshades over the windows, flower boxes on the footpaths,
    yellow-and-black speed breakers and manhole covers. Phones on LOW skip the heavy bits.
  - **A set piece in EVERY mission (researched: missions get boring when they are all the same checklist):** each of
    the 76 missions gets one of eight special tasks with its own story line - SNIPER NEST, ARMS DROP, HOLD THE LINE,
    TAIL A CAR, INTERCEPT A COURIER, CUT THE POWER, PLANT TRACKERS, RESCUE. Quiet or loud is your choice, and things
    get harder step by step (backup comes, he runs, his gang protects him) instead of failing at once.
    Code: `web-demo/src/setpieces.js`, guns: `weapons.js` + `player.js`, loot: `loot.js`.
- **v9.6: the Navapur Director (free roam is never quiet):** like a film director, the city makes something crazy
  happen every 45-75 seconds - calm, trouble, relief, calm again - and waits when Vikram is already busy (2+ stars,
  a fight, inside a shop). Events (with a timer on the mission box, red pins and a reward):
  CHAIN SNATCHER (sprint after him and tackle him, +₹600 "hero of Navapur"), ROBBERY IN PROGRESS (Kaali's boys at a
  shop, gas cylinders next to them, +₹900), GOLD VAN (wreck it, the gold spills as cash; the police come), RUNAWAY
  TANKER (a burning tanker races to the market - blow it up in 45 s, +₹1,000). Code: `web-demo/src/director.js`.
  A car the mission needs never rolls away in a bail-out.
- **v9.5: crazy moves + no boring missions:**
  - **Bullet-time dive:** while aiming, press JUMP - Vikram flies sideways through the air in slow motion and keeps
    shooting (bullets rarely hit him in the air), lands flat and gets up.
  - **Sutli bombs:** the BOMB button (PC: N) throws a Diwali sutli bomb. It bounces, the fuse fizzes, and 2 seconds later
    DHAMAKA - goons and cops fly, cars blow up. 3 at the start, +1 from every ammo box, +2 with AMMO from a shop.
    2+ people in one blast = DHAMAKA! (slow motion + bonus).
  - **Gas cylinders:** 44 red LPG cylinders stand outside shops, and every gang fight has 1-3 next to the goons. Shoot
    one, bomb it or ram it: a fireball, and the cylinders near it go off one after another.
  - **Bail out:** get out of a car above 40 km/h - he tumbles out in slow motion (two cartwheels) and the car rolls on
    by itself, runs people over and crashes into whatever is ahead (a hard crash = it burns and explodes).
  - **Task after task:** no more "go there and stand". Goons hassle the contact at the meeting (save them first), an
    ambush hits on the road to the job (gang cars that chase and ram, or men from an alley), the police must be lost
    before the job, every safehouse run has a fight, and talking never makes you wait. TASK 1, 2, 3... count up on the
    mission box with a tick and +₹100 for each one.
  - **Languages:** menus, buttons and settings are English again; the chosen language is for Vikram's reminder text
    and all the voices (the speaker button on the main menu).
- **v9.3: 10 languages + fight the police:**
  - **Languages:** English, हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം, ગુજરાતી, मराठी, বাংলা, ଓଡ଼ିଆ. The globe button on the main
    menu (and Settings -> Language) opens the picker; the first launch asks once. Menus, settings, pause, result, HUD
    buttons, banners, police and chase messages and shop texts change. Vikram's objective lines and reminders, his
    greetings, the shopkeepers and the police SPEAK the language in everyday words ("Ravi's garage కి వెళ్ళాలి",
    "டைம் இல்ல மச்சான்"), with the best voice the phone has for it (offline Google voices in the Android app; the
    natural Edge voices on PC). The Android app shows GET THE VOICE (opens the phone's voice download) when the phone has
    no voice for the language. Words: `web-demo/src/i18n.js`.
  - **v9.4 - one language only:** in an Indian language every spoken line is in that language, with that
    language's voice: Vikram (objective lines and reminders say "go to the yellow mark on the map" - no English names
    inside), street people, chai / fruit sellers, shopkeepers and the police. Story scenes are subtitles only in those
    languages (spoken in English mode). A device with no voice for the language stays silent - never English or Hindi
    instead - and the picker says how to get the voice. Checked by a robot that records every spoken line (app voice
    bridge and browser voices) in all 10 languages: 0 lines in the wrong language.
  - **Fight back:** a cop who grabs Vikram no longer means instant BUSTED. He gets ONE MINUTE: the FIGHT button punches
    (2 punches knock out a constable, 3 a SWAT officer; each punch knocks him back), or shoot. The cops holding him do not
    shoot during that minute. Beat the cops near him (or get 9 m away for 3 seconds) = YOU BROKE FREE; still held when the
    minute ends = BUSTED. Every cop he takes down gives +20 health (gangsters +10).
  - **v9.4 - breather, then backup:** beat the cops who came for Vikram (kill one, none left near him) and the police
    regroup: no new police for 2-3 minutes, the cars go back, the music calms down and BACKUP IN 2:30 counts down on
    screen ("finish the job fast!"). At 0:00 a bigger backup comes (+1 star, every car chases). In a story mission the
    stars stay during the breather (except on a "lose the police" step), so the mission has to be finished fast;
    scripted shoot-outs keep their pressure. Missions still take 5-10 minutes (robot: 307-622 s each).
  - **Tougher Vikram:** all damage x0.65; health comes back after 4 s (was 6) at 8 a second.
  - **More police in story missions:** one more chasing police car at every star level, and one more officer out of each car.
- **v9 new look (UI):** the main menu is a game lobby that fits any phone screen (STORY, FREE ROAM, SHOP cards, a big PLAY
  button that continues the story, rank, cash and settings at the top). Missions, shop and settings are full-screen pages
  with a BACK button; the pause menu shows what you are doing; the result card fits on one phone screen. In the game:
  cleaner glass buttons, a short 2-line objective (a new objective shows in full for a few seconds), a health + armour
  bar under the gun slots, short chase messages, and warning banners that never cover the mission box.
- **Feedback from friends:** FEEDBACK and SHARE buttons on the main menu open WhatsApp with a ready message (rating,
  what I liked, what to fix, phone model). QR code + "scan to play" poster: `marketing/`.
- **Voices (Indian English):** every story line is spoken in the character's voice, Vikram says each new objective
  ("Okay. First, I have to go to Ravi's garage"), reminds you if you stand around, and greets people he talks to.
  Uses the phone's / PC's own voices (free, works offline). Settings -> Voices.
- **Police raids:** hiding in a courtyard or an alley no longer works: a police van parks at the block, officers walk in
  through the gaps and search every corner. If one grabs you while you walk (not run), the one-minute fight starts (v9.3).
- **Clean controls:** on foot only walking + shooting buttons; in a car only driving + gun buttons. Car buttons sit like
  the popular mobile shooter layout: gas / brake arrows on the left with BRAKE beside them, steer left / right on the right
  with the horn, EXIT VEHICLE under the top-right corner, camera and speed at the bottom left. CALL THE COPS is in the pause menu.
- **Opening:** "BUILT BY VENU BRUSHWOOD" on the loading screen and the main menu.
- **Living city:** many more cars (hatchbacks, sedans, SUVs, taxis, autos, vans, trucks, buses) and cars parked half on the
  footpath, Indian style. People walk the streets and cross at zebra crossings; cars stop for them.
- **Talk to anyone:** walk up to a person - TALK (a card shows their name, job and a funny fact), ROB (pickpocket from behind),
  PUSH, GIVE ₹100, HIRE ₹500 (they follow and fight for you), BUY chai or fruit to heal. Aim a gun at someone: hands up,
  they drop their wallet. Witnesses phone the police unless you stop them.
- **Realistic cars:** smooth curved bodies (no real brands), dark glass, door lines, mirrors, number plates,
  alloy wheels that spin and steer, head and tail lights that glow at night.
- **Day, night, storm and blackout:** golden-hour day; night with lit windows, street-light pools and headlights;
  monsoon storm with rain, wet roads, lightning and thunder; reflective glass towers; film-style colour grade.
- **Rewards:** cash pop-ups, kill combos, headshots, near-miss / drift / stunt-jump bonuses, slow motion,
  street rank (XP) with unlocks, a shop (armour, shotgun, rifle, golden pistol, nitro, big magazines), daily reward streak,
  animated results (stars, cash count-up, XP bar). Indian-style action music that rises with the chase.
- **Combat:** pistol, SMG, shotgun, rifle, golden pistol; aim help on phones (slows on target, snaps when you press AIM), strafe and walk
  backwards while aiming, sprint lock (drag the joystick far up).
- **Police (5 stars):** arrest at 1 star, shooting at 2, SWAT + roadblocks at 3, helicopter with searchlight +
  spike strips at 4-5. Officers find their way round buildings; cars predict where you go and ram you.
- **Escaping:** a red search circle on the map. Get out of it while nobody sees you and the stars go.
  A different car the police did not see also helps.
- **Driving:** arrow buttons (left/right + up = gas / down = brake) by default, or the joystick (switch button in the car);
  BOOST (nitro), DRIFT, FIRE from the window, horn, camera; stunt ramps, crashes, burst tyres, cars that catch fire and explode.
- **On foot:** realistic walk / jog / sprint with weight (like GTA), smooth follow camera.
- **Map:** mini-map with GPS route; tap it for the full map and set a waypoint.
- **Settings:** sensitivity, aim help, car controls, button size, difficulty, graphics level, sound, time of day (pause menu).
- **Customize controls (like PUBG):** Settings or Pause -> CUSTOMIZE CONTROLS. Drag any button, change its size and
  see-through level, separate ON FOOT and IN CAR layouts. Saved on the phone.

The **Unity project stays the real game** - the demo is for feedback and promotion.

- Live (temporary Hostinger domain): https://worldly-mediumturquoise-anteater-68.hostingersite.com
- **Android app:** `download/CityThief.apk` on the site (the game inside, offline, full screen, Indian English voices,
  back button = pause). Source: `android/`, build: `tools/build-android.sh` (Ubuntu android-sdk packages, no Gradle).
- **Windows PC:** `download/CityThief-Windows.zip` -> unzip -> `CityThief.exe` (offline, F11 full screen). Source: `desktop/`,
  build: `node tools/build-windows.js <electron-win32-x64.zip> <out>`. Or on any PC: open the site in Chrome / Edge and
  click INSTALL APP (works offline after the first visit thanks to `sw.js`, made by `tools/make-sw.py`).
- **PC controls:** W A S D move / drive, mouse look, left click fire, right click aim, Shift sprint / nitro, Space jump /
  handbrake, E car, R reload, 1 / 2 or mouse wheel or Q gun slots, C crouch, Y talk, U rob (rob the till in a shop),
  I buy, O push, H hire / horn, K photo, T takedown, M map, J mission steps, Esc pause.
- Run locally: `cd web-demo && python3 -m http.server 8000`, then open http://localhost:8000
- Quality: auto (phones = medium, 4 GB phones = low, computers = high). Force with `?low`, `?medium`, `?high`. Add `?fps` to see the frame rate.
- Code: `web-demo/src/`; third-party asset credits: `web-demo/assets/CREDITS.txt` (people: Microsoft Rocketbox, MIT).
- Size: about 9.8 MB to download; draw calls about 60-140 on Low quality (cheap phones).
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
├── web-demo/                     <- the playable game (Three.js), deployed to the website
├── android/                      <- Android app (WebView + phone voices), built by tools/build-android.sh
├── desktop/                      <- Windows app (Electron), built by tools/build-windows.js
├── tools/                        <- make-sw.py (offline cache), build-android.sh, build-windows.js
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
