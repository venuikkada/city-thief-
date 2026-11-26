// Story missions 27-76: five new chapters in Navapur (and the "EARLIER..." flashbacks for every mission).
//   Chapter 4  STREET SMART      - talk, pickpocket, hire a crew, chase on foot (boss: Chhota Babu)
//   Chapter 5  UNDERCOVER        - disguises, photos, phone tapping, escorts (boss: Neta Bhanwar Lal)
//   Chapter 6  FAST AND DESI     - car lists, bus, ambulance, trucks, drag race, derby (boss: Collector Kapoor)
//   Chapter 7  FESTIVAL CITY     - Diwali, kites and drones, garba, gully cricket, visarjan, mela (boss: Rana)
//   Chapter 8  KING OF NAVAPUR   - the big bank heist: setups, choices, betrayal, the Commissioner
// Each mission follows "teach, grow, twist, finish" (see Docs/MISSION_RESEARCH.md).
import * as K from './mkit.js';

const PI = Math.PI;
// Places in Navapur.
const PL = {
  start: [6.6, 19.5], chai: [7.8, 31], yard: [37.5, 37.5],
  bazN: [37.5, 112.5], bazW: [-187.5, -112.5], bazE: [112.5, -112.5],
  plaza: [37.5, -37.5], bank: [-37.5, -37.5], downtown: [-37.5, -18],
  wh: [-33, 32], whDoor: [-38, 36.5],
  parkW: [-112.5, 37.5], parkE: [187.5, 37.5], parkN: [-37.5, 187.5],
  hosp: [112.5, 2.25], prom: [0, -233.5], docks: [150, -233.5],
  copHQ: [-112.5, 112.5], hide: [-187.5, 112.5], hide2: [187.5, -112.5], cafe: [40, -233.5],
  wedding: [-37.5, -187.5], garage: [-75, -37], kapoor: [187.5, 112.5],
};
const ring = (c, r, n, off = 0) => Array.from({ length: n }, (_, i) => [c[0] + Math.cos(off + (i / n) * PI * 2) * r, c[1] + Math.sin(off + (i / n) * PI * 2) * r]);

export function moreMissions(H) {
  const { place, act, say, wait, waitFor, goTo, getIn, loseCops, killGroup, collect, destroy, tail, hold, defuse, countdown, race, bossFight,
    parkedCar, missionCar, gang, spawnRavi } = H;
  const boss = (g, m, name, x, z, o = {}) => {
    const b = g.spawnOfficer(x, z, 0, null, { gang: true, hostile: true, boss: true, name, model: o.model || 'm_office', weapon: o.weapon || 'smg', health: o.health || 700, damage: o.damage || 1.1 });
    m.track(b); m.vars.boss = b; return b;
  };
  const crew = (g, m, x, z, rig = 'ravi') => {
    const r = rig === 'ravi' ? spawnRavi(g) : new H.AmbientPerson(g, x, z, 0, { rig: new H.CharacterRig(rig, { castShadow: g.shadows }) });
    if (rig !== 'ravi') g.ambient.push(r);
    r.x = x; r.z = z; r.calm = true; r.noInteract = true; m.track(r); g.ravi = rig === 'ravi' ? r : g.ravi; return r;
  };
  const spawnThug = (g, m, x, z, o) => K.thugs(g, m, [[x, z]], o);
  const sign = (g, m, x, z, color = 0xc0392b) => {   // simple painted sign board (hospital, bank...)
    const G = new H.THREE.Group();
    const board = new H.THREE.Mesh(new H.THREE.BoxGeometry(2.4, 1.0, 0.12), new H.THREE.MeshStandardMaterial({ color: 0xf4f4f4 }));
    board.position.y = 3; G.add(board);
    for (const [w, h] of [[0.7, 0.18], [0.18, 0.7]]) { const c = new H.THREE.Mesh(new H.THREE.BoxGeometry(w, h, 0.14), new H.THREE.MeshBasicMaterial({ color })); c.position.y = 3; G.add(c); }
    const pole = new H.THREE.Mesh(new H.THREE.CylinderGeometry(0.06, 0.06, 2.6), new H.THREE.MeshStandardMaterial({ color: 0x555555 })); pole.position.y = 1.3; G.add(pole);
    G.position.set(x, 0.15, z); g.scene.add(G); m.track(G); return G;
  };

  const M = [
    // ===================== CHAPTER 4: STREET SMART =====================
    {
      id: 27, title: 'Word on the Street', atmo: 'day',
      brief: 'Ravi has vanished. Nobody in the bazaar wants to talk... unless you ask the right person (and pay the right price).',
      reward: 3000, par: [150, 240], next: 'Chhota Babu, the pickpocket king, wants to meet you.',
      intro: [{ at: [PL.chai[0] - 1.5, PL.chai[1] - 2], yaw: PI / 2, act: 'phone', cam: 'front', where: 'Raju Tea Stall · 8:10 AM', text: 'Vikram had been calling Ravi all night. No answer. Ravi had never missed their morning chai.' },
        { at: [33, 108], yaw: 0, act: 'look', cam: 'side', where: 'North Bazaar · 9:00 AM', text: 'So Vikram went where all the gossip in Navapur goes - the bazaar.' }],
      steps: () => [
        place(30, 100, 0),
        say([['VIKRAM', 'Someone here saw Ravi. Time to ask around.']]),
        K.askAround([
          { at: [28, 106], yaw: PI / 2, rig: 'f_salwar', gesture: 'talk', line: 'Ravi? Haan, kal raat ek kaali gaadi mein le gaye usko... Pan wale ko pata hoga.' },
          { at: [46, 104], yaw: -PI / 2, rig: 'm_kurta', gesture: 'wait', line: 'Mujhe kuch nahi pata. Main to bas sabzi lene aaya.' },
          { at: [40, 121], yaw: PI, rig: 'm_worker', gesture: 'drink', pay: true, payLine: 'Pan wala free mein kuch nahi bolta... (GIVE ₹100)', line: 'Chhota Babu ke aadmi le gaye. Purane godown mein band hai, park ke paas!', key: true },
          { at: [31, 119], yaw: PI / 2, rig: 'f_purple', gesture: 'phone', line: 'Kaali gaadi? Pan wale se pucho, woh sab dekhta hai.' },
        ], 'Find out where Ravi is: talk to the people in the bazaar'),
        say([['VIKRAM', 'The old godown near the park. Hold on, Ravi.']]),
        goTo(PL.whDoor[0], PL.whDoor[1] - 3, 4, 'Go to the old godown (warehouse)'),
        act((g, m) => { gang(g, m, [[-36, 30], [-28, 34], [-31, 26], [-40, 28]], { group: 'gd' }); m.vars.r = crew(g, m, -33, 38); m.vars.r.rig.setGesture('sit'); }),
        say([['GOON', 'Arre, Vikram aa gaya! Pakdo usko!']]),
        killGroup('gd', 'Beat Chhota Babu\'s goons'),
        say([['RAVI', 'Bhai! I knew you would come. Chhota Babu wants Navapur\'s streets - and we are in his way.']]),
      ],
    },
    {
      id: 28, title: 'Light Fingers', atmo: 'day',
      brief: 'Chhota Babu bets you cannot pickpocket four rich tourists on the seafront without getting caught. Sneak up from BEHIND and tap ROB.',
      reward: 3200, timer: 300, par: [140, 220], next: 'A thief snatched a grandmother\'s purse right in front of you...',
      onEvent: (g, m, type, data) => {
        K.countRobs(g, m, type, data);
        if (type === 'rob' && data && data.person && data.person.markDef && data.person.markDef.cop && !m.vars.copCaught) {
          m.vars.copCaught = true; g.dispatch.setStars(2); g.hud.showBig('HE IS A COP!', '#ff4438', 1.6);
        }
      },
      intro: [{ at: [10, -233], yaw: -PI / 2, act: 'talk', cam: 'front', where: 'Seafront · 5:30 PM', with: [{ rig: 'm_red', f: 1.6, r: 0.3, act: 'talk' }],
        text: 'Chhota Babu laughed: "Four wallets before sunset. Get caught once, and you work for ME."' }],
      steps: () => [
        place(0, -233, -PI / 2),
        say([['CHHOTA BABU (phone)', 'Four fat wallets on the promenade. From behind, quietly. Shabash ya sharam - your choice!']]),
        K.pickpocket([
          { at: [-20, -233], yaw: PI / 2, rig: 'm_office', name: 'Mr. Malhotra', job: 'Diamond trader', cash: 900, walk: [[-20, -233], [-60, -233]] },
          { at: [-70, -232], yaw: -PI / 2, rig: 'f_coat', name: 'Mrs. Kapadia', job: 'Builder\'s wife', cash: 1200, walk: [[-70, -232], [-30, -232]] },
          { at: [40, -234], yaw: -PI / 2, rig: 'm_sweater', name: 'Rocky', job: 'Film producer', cash: 1500 },
          { at: [80, -232], yaw: PI / 2, rig: 'm_jacket', name: 'Inspector Bhosle (off duty)', job: 'Plain-clothes police', cash: 700, cop: true, alert: true, walk: [[80, -232], [50, -232]] },
        ], 'Pickpocket the marked tourists', { need: 3 }),
        waitFor('Lose the police!', (g) => g.dispatch.stars === 0),
        say([['CHHOTA BABU (phone)', 'Not bad, Vikram. Not bad at all... but the streets are still mine.']]),
      ],
    },
    {
      id: 29, title: 'Purse Snatcher', atmo: 'day',
      brief: 'A thief grabs an old lady\'s purse and runs through the bazaar crowd. Chase him on foot and tackle him. Then: give the purse back, or keep it?',
      reward: 2500, par: [60, 110], next: 'You need a crew if you want to fight Babu.',
      intro: [{ at: [110, -101], yaw: PI, act: 'drink', cam: 'side', where: 'East Bazaar · 11:00 AM', text: 'Vikram was only buying a cold drink in the East Bazaar when he heard a scream...' }],
      steps: () => [
        place(110, -101, PI),
        act((g, m) => {
          const lady = K.person(g, m, 108, -104, -PI / 2, 'f_grey', { gesture: 'talk' }); m.vars.lady = lady;
          m.vars.snatcher = K.person(g, m, 112, -106, PI, 'm_hoodie');
        }),
        say([['DADI', 'Chor! Chor! Mera purse! Koi pakdo usko!']]),
        K.footChase('snatcher', [[120, -118], [125, -125], [143.5, -125], [143.5, -95], [143.5, -81.5], [110, -81.5], [81.5, -81.5], [81.5, -110], [81.5, -124.8], [92, -124.8], [110, -118]], 'Catch the purse snatcher! (run - hold the joystick far up to sprint)', { speed: 4.7, toast: 'CHASE HIM!' }),
        say([['SNATCHER', 'Bas bas! Le lo purse!']]),
        K.choose('The purse has ₹2,000 and a photo of her grandson.', 'GIVE IT BACK (+respect)', 'KEEP IT (+₹2,000)',
          () => [goTo(108, -104, 2.5, 'Give the purse back to Dadi'), act((g) => g.rewards.event('GOOD DEED', 800, 80)), say([['DADI', 'Jeete raho beta! You are a good boy, whatever they say about you.']])],
          () => [act((g) => { g.rewards.addCash(2000, 'KEPT THE PURSE', 'cash'); g.dispatch.setStars(1); }), say([['VIKRAM', 'Sorry, Dadi. Navapur is not kind to anyone.']]), loseCops('A shopkeeper called the police! Lose them')]),
      ],
    },
    {
      id: 30, title: 'Crew Up', atmo: 'day',
      brief: 'Babu\'s goons are coming to burn Raju\'s chai stall. Hire two people from the street (HIRE ₹500) and defend the stall together.',
      reward: 3500, par: [160, 240], next: 'Babu\'s men talk too much over chai...',
      onEvent: (g, m, type) => { if (type === 'hire') m.vars.hired = (m.vars.hired || 0) + 1; },
      intro: [{ at: [6, 29], yaw: PI / 2, act: 'listen', cam: 'front', where: 'Raju Tea Stall · 3:00 PM', with: [{ rig: 'm_kurta', f: 1.8, r: -0.4, act: 'talk' }],
        text: 'Raju the chai wala was shaking: "Babu wants hafta from me, or he burns my stall tonight."' }],
      steps: () => [
        place(5, 26, PI / 2),
        act((g) => { g.save.coins += 1000; g.hud.popup('+₹1,000 FROM RAJU (for your crew)', 'bonus'); }),
        say([['RAJU', 'Take this, beta. Hire some strong boys from the street. Babu\'s men come in two minutes!']]),
        waitFor('Hire 2 people: walk up to anyone and tap HIRE', (g, m) => (m.vars.hired || 0) >= 2 || g.interact.followers.length >= 2),
        say([['VIKRAM', 'Crew is ready. Let them come.']]),
        K.waves([{ at: [[-6, 40], [-6, 46], [22, 50]] }, { at: [[-6, 18], [20, 12], [-8, 30], [24, 44]] }, { at: [[-5, 50], [-5, 12], [22, 30], [22, 48], [-8, 36]], weapon: 'smg' }],
          'Defend the chai stall', (g, m, x, z, o) => spawnThug(g, m, x, z, o), { zone: [7.8, 31, 22], zoneFail: 'You left the chai stall alone' }),
        say([['RAJU', 'Wah! Chai free for life for you and your boys!']]),
      ],
    },
    {
      id: 31, title: 'Chai Pe Charcha', atmo: 'day',
      brief: 'Dress as Raju\'s chai boy and serve Babu\'s men at the park. Talk to each of them - they talk too much. Find out where tonight\'s deal is.',
      reward: 3000, par: [150, 240], next: 'A taxi job... with a dangerous passenger.',
      intro: [{ at: [-104, 30], yaw: 0, act: 'wait', cam: 'front', where: 'West Park · 4:00 PM', text: 'Vikram borrowed Raju\'s old kurta and a kettle. Nobody looks twice at a chai boy.' }],
      steps: () => [
        place(-104, 25, 0),
        K.disguise('m_kurta', 'chai', 'CHAI BOY'),
        act((g, m) => { K.guards(g, m, [[-100, 46, PI], [-123, 40, PI / 2], [-104, 58, PI, [[-104, 58], [-120, 58]]]], 'chai', { group: 'ck' }); }),
        K.askAround([
          { at: [-108, 40], yaw: PI, rig: 'm_denim', gesture: 'talk', line: '(GOON) Chai? Achha... Babu ka maal aaj raat aa raha hai, 9 baje.' },
          { at: [-118, 46], yaw: -PI / 2, rig: 'm_tee', gesture: 'listen', line: '(GOON) Shhh... jagah? Seafront ke paas. Boat se.' },
          { at: [-112, 56], yaw: PI, rig: 'm_red', gesture: 'phone', line: '(GOON) Haan boss, docks, east wala jetty. Done.', key: true },
        ], 'Serve chai and listen: talk to Babu\'s men'),
        K.undisguise(),
        say([['VIKRAM', 'The east jetty at the docks, 9 o\'clock. Let\'s get there first.']]),
        goTo(PL.docks[0], PL.docks[1], 6, 'Get to the east jetty before Babu\'s men'),
        act((g, m) => gang(g, m, [[142, -236], [156, -238], [160, -232]], { group: 'jt' })),
        killGroup('jt', 'Take the jetty from Babu\'s men'),
      ],
    },
    {
      id: 32, title: 'Kaali Peeli', atmo: 'day',
      brief: 'Drive a black-and-yellow taxi. Two easy fares... and a third passenger who is running from Babu. Get him to the police station alive.',
      reward: 3400, par: [200, 300], next: 'Sunny has a crazy idea: an auto-rickshaw race.',
      intro: [{ at: [-70, 6.5], yaw: PI / 2, act: 'talk', cam: 'front', where: 'Taxi stand · 7:00 AM', with: [{ rig: 'm_sweater', f: 1.7, act: 'talk' }],
        text: 'Old taxi driver Joseph owed Vikram a favour. "Drive my kaali peeli for a day - and keep the fares."' }],
      steps: () => [
        act((g, m) => { const t = parkedCar(g, m, 'taxi', 0x111111, -70, -2.25, PI / 2, 'taxi'); g.placePlayer(-70, -5.6, PI / 2); g.driving.enter(t); g.camera3p.snapBehind(); }),
        K.passengers('taxi', [
          { at: [-40, 6.6], dest: [37.5, 77.75], destName: 'North Bazaar' },
          { at: [44, 81.5], dest: [77.75, -40], destName: 'Downtown towers' },
          { at: [81.5, -55], dest: [-75, 115], destName: 'Police station', say: [['WITNESS', 'Bhai, jaldi chalo! Babu ke aadmi mere peeche hain!']] },
        ], 'Taxi', { fare: 250 }),
        act((g, m) => { g.rewards.event('WITNESS SAFE', 600, 40); }),
        say([['JOSEPH (phone)', 'Taxi in one piece? Ha! You drive better than me, Vikram.']]),
      ],
    },
    {
      id: 33, title: 'Rickshaw Rumble', atmo: 'day',
      brief: 'Sunny\'s new idea: an auto-rickshaw race through city traffic. Three autos, one lap, no brakes worth mentioning.',
      reward: 2800, par: [110, 150], next: 'A tiffin man is carrying more than lunch...',
      intro: [{ at: [190, -219], yaw: -PI / 2, act: 'cheer', cam: 'front', where: 'Marine Drive · 6:00 AM', with: [{ rig: 'm_red', f: 1.5, r: 0.8, act: 'talk' }],
        text: 'Sunny filled four autos with racing stickers. "Bhai, this will go viral. Auto racing is the future!"' }],
      steps: () => [
        act((g, m) => {
          g.raceGo = false; g.raceHold = true;
          const a = parkedCar(g, m, 'auto', 0, 195, -222.8, -PI / 2, 'mine');
          g.placePlayer(197, -219, -PI / 2); g.driving.enter(a);
          m.vars.racers = [[195, -227.2], [201, -222.8], [201, -227.2]].map(([x, z], i) =>
            missionCar(g, m, 'auto', 0, { mode: 'race', cps: H.RACE_CPS, top: 17.5 + i * 0.4, skill: 0.95 + i * 0.03, lane: i === 1 ? 0 : (i ? 2.2 : -2.2), health: 300 }, { x, z, yaw: -PI / 2 }));
          g.camera3p.snapBehind();
        }),
        say([['SUNNY', 'Three... two... one... and may the best rickshaw win!']]),
        countdown(),
        race(H.RACE_CPS, 'WIN THE AUTO RACE!'),
        say([['SUNNY', 'Ten thousand views already! Auto king of Navapur!']]),
      ],
      rate: (g, m) => (m.elapsed < 110 ? 3 : m.elapsed < 150 ? 2 : 1),
    },
    {
      id: 34, title: 'Tail the Tiffin', atmo: 'day',
      brief: 'A tiffin delivery man carries Babu\'s cash in his lunch boxes. Follow him on foot - not too close - and photograph where he goes.',
      reward: 3300, par: [150, 240], next: 'Babu\'s men are coming to burn the bazaar.',
      intro: [{ at: [62, 6.5], yaw: -PI / 2, act: 'look', cam: 'front', where: 'Start block · 12:30 PM', text: 'Ravi had noticed: the same tiffin man walks into Babu\'s area every day... and never comes back with empty boxes.' }],
      steps: () => [
        place(70, 6.5, -PI / 2),
        act((g, m) => { const t = K.person(g, m, 56, 6.5, -PI / 2, 'm_delivery'); t.calm = true; m.vars.tiffin = t; t.route = [[8.5, 6.5], [6.5, -8.5], [-6.5, -12], [-6.5, -40], [-6.5, -68.5], [-30, -68.5], [-36, -68.5]]; t.ri = 0; }),
        say([['RAVI (phone)', 'There he is, the tiffin man. Follow him - but if he sees you, the trail goes cold.']]),
        {
          start: (g, m) => m.objective('Follow the tiffin man (keep 8-30 m away)'),
          update: (g, m, dt) => {
            const t = m.vars.tiffin, P = g.player;
            const w = t.route[t.ri];
            if (dist2(t.x, t.z, w[0], w[1]) < 1.2 && t.ri < t.route.length - 1) t.ri++;
            t.walkTo = { x: t.route[t.ri][0], z: t.route[t.ri][1] }; t.walkSpeed = 1.5;
            const d = dist2(t.x, t.z, P.x, P.z);
            m.vars.close = d < 8 ? (m.vars.close || 0) + dt : Math.max(0, (m.vars.close || 0) - dt);
            m.vars.far = d > 30 ? (m.vars.far || 0) + dt : 0;
            g.hud.setProgress(d < 8 ? 'TOO CLOSE!' : d > 30 ? 'TOO FAR!' : 'GOOD DISTANCE', 1 - Math.min(1, (m.vars.close || 0) / 3), d < 8 || d > 30 ? '#ff5a4d' : '#7dff8a');
            m.marker(t.x, t.z, 1.2, true);
            if (m.vars.close > 3) { m.fail('He saw you following him'); return false; }
            if (m.vars.far > 8) { m.fail('You lost him'); return false; }
            return t.ri === t.route.length - 1 && dist2(t.x, t.z, w[0], w[1]) < 1.5;
          },
          end: (g, m) => { g.hud.hideProgress(); m.marker(null); },
        },
        act((g, m) => { m.vars.guard = K.guards(g, m, [[-41, -68.5, PI / 2], [-44, -68.5, PI / 2]], null, { group: 'tg' }); }),
        K.photo((g, m) => [{ x: m.vars.tiffin.x, y: 1.4, z: m.vars.tiffin.z, label: 'tiffin man' }, { x: -41, y: 1.4, z: -68.5 }], 'Photograph the hand-over', { range: 45 }),
        say([['RAVI (phone)', 'Perfect. Now we know where Babu counts his money.']]),
      ],
    },
    {
      id: 35, title: 'Bazaar on Fire', atmo: 'night',
      brief: 'Babu\'s men come at night with petrol cans to burn the North Bazaar. Stop them at three stalls before the bazaar burns.',
      reward: 3600, par: [150, 240], next: 'Time to end Chhota Babu.',
      intro: [{ at: [37.5, 100], yaw: 0, act: 'talk', cam: 'front', where: 'North Bazaar · 10:30 PM', with: [{ rig: 'ravi', f: 1.6, r: 0.4, act: 'listen' }, { rig: 'm_kurta', f: 1.4, r: -1.2, act: 'phone' }],
        text: 'The stall owners begged Vikram and Ravi: "Babu says he will burn us all tonight if we stay loyal to you."' }],
      watch: (g, m, dt) => H.allyFight(g, m, g.ravi, dt),
      steps: () => [
        place(37.5, 100, 0),
        act((g, m) => { crew(g, m, 40, 101); }),
        say([['RAVI', 'They come from three sides. One stall each, bhai. GO!']]),
        K.waves([{ at: [[25, 108], [26, 124]] }, { at: [[50, 108], [50, 124], [44, 125]] }, { at: [[28, 100], [46, 100], [37, 125], [50, 118]], weapon: 'smg' }],
          'Stop the arsonists', (g, m, x, z, o) => spawnThug(g, m, x, z, o), { zone: [37.5, 112.5, 30], zoneFail: 'The bazaar burned down' }),
        say([['RAVI', 'The bazaar is safe. Babu has nothing left but himself.']]),
      ],
    },
    {
      id: 36, title: 'Chhota Babu', atmo: 'day', chapterEnd: 4,
      brief: 'Babu hides in the seafront crowd. Ask people which way he went, chase him down, then finish him and his last men.',
      reward: 6000, par: [200, 320], next: 'A politician is printing fake money. Time to go undercover.',
      intro: [{ at: [-20, -219], yaw: PI, act: 'phone', cam: 'side', where: 'Seafront · 6:00 PM', text: 'Babu called Vikram one last time: "Come alone to the seafront. Let\'s end this like gentlemen." Nobody in Navapur believed that.' }],
      steps: () => [
        place(-20, -228, PI),
        K.askAround([
          { at: [-30, -233], yaw: 0, rig: 'f_pink', gesture: 'phone', line: 'Babu? Woh chhota aadmi? Ice-cream wale ki taraf gaya...' },
          { at: [-55, -234], yaw: PI / 2, rig: 'm_tee', gesture: 'wait', line: 'Haan, abhi abhi bhaga - lal shirt mein, west ki taraf!', key: true },
          { at: [-12, -235], yaw: -PI / 2, rig: 'f_green', gesture: 'talk', line: 'Mujhe mat pucho, main busy hoon.' },
        ], 'Find Chhota Babu: ask the people on the promenade'),
        act((g, m) => { m.vars.babu = K.person(g, m, -80, -233, -PI / 2, 'm_red'); }),
        say([['CHHOTA BABU', 'Pakad sako to pakad lo, Vikram!']]),
        K.footChase('babu', [[-110, -233], [-140, -232], [-150, -238], [-150, -250], [-180, -248], [-200, -235], [-170, -232]], 'Catch Chhota Babu!', { speed: 4.9 }),
        act((g, m) => { g.ambient = g.ambient.filter((a) => a !== m.vars.babu); m.vars.babu.remove(); boss(g, m, 'CHHOTA BABU', m.vars.babu.x, m.vars.babu.z, { model: 'm_red', health: 520 }); gang(g, m, [[-150, -240], [-140, -245], [-165, -245]], { group: 'bb', weapon: 'smg' }); }),
        say([['CHHOTA BABU', 'Boys! KILL HIM!']]),
        bossFight('boss', 'Take down CHHOTA BABU'),
        act((g) => { g.slowmo(1.4, 0.25); g.hud.showBig('THE STREETS ARE YOURS', '#ffc531', 2.5); g.rewards.event('BABU FINISHED', 2000, 150); }),
      ],
    },

    // ===================== CHAPTER 5: UNDERCOVER =====================
    {
      id: 37, title: 'Delivery Boy', atmo: 'day',
      brief: 'Neta Bhanwar Lal stores fake money in the old godown. Wear a delivery uniform and walk in like you belong. Put a tracker on his van. Don\'t run!',
      reward: 3400, par: [120, 200], next: 'You need a police uniform for the next step.',
      intro: [{ at: [8, 22], yaw: PI / 2, act: 'phone', cam: 'front', where: 'Start block · 10:00 AM', text: 'Ravi\'s cousin worked for a delivery app. One uniform, one fake parcel - and a tracker inside it.' }],
      steps: () => [
        place(-6.5, 25, -PI / 2),
        K.disguise('m_delivery', 'delivery', 'DELIVERY BOY'),
        act((g, m) => {
          K.guards(g, m, [[-38, 34, 0], [-30, 30, PI], [-36, 26, PI / 2, [[-36, 26], [-46, 26]]], [-26, 36, -PI / 2]], 'delivery', { group: 'dg', model: 'm_office' });
          parkedCar(g, m, 'van', 0x2b2b2b, -28, 28, 0, 'van');
        }),
        say([['RAVI (phone)', 'Walk slowly, look bored. Delivery boys are always bored.']]),
        hold(-28, 31.5, 2.2, 3, 'Walk to the black van and plant the tracker', { label: 'PLANTING TRACKER' }),
        goTo(-6.5, 25, 3, 'Walk out calmly (the gap in the buildings, east side)'),
        K.undisguise(),
        say([['RAVI (phone)', 'Tracker is live! Neta\'s van is going to the police HQ... interesting.']]),
      ],
      onAlert: (g, m) => { if (!m.vars.alarmed) { m.vars.alarmed = true; g.dispatch.setStars(2); g.hud.showBig('YOUR COVER IS BLOWN!', '#ff4438', 1.6); } },
    },
    {
      id: 38, title: 'Uniform', atmo: 'day',
      brief: 'Steal a police uniform from the drying lines behind the police station, wear it, and walk into the yard to take Neta\'s file.',
      reward: 3600, par: [150, 240], next: 'Neta meets someone secret at the seafront cafe.',
      intro: [{ at: [-112, 92], yaw: 0, act: 'look', cam: 'high', where: 'Police station · 7:00 AM', text: 'Every morning the police laundry boy hangs the uniforms out to dry. Vikram had been watching him for a week.' }],
      steps: () => [
        place(-112, 86, 0),
        collect('uni', [[-128, 96]], 'Steal a uniform from the drying line', { type: 'intel', car: false }),
        K.disguise('police', 'police', 'CONSTABLE'),
        act((g, m) => {
          K.guards(g, m, [[-118, 108, 0], [-106, 116, PI], [-112, 124, PI], [-100, 108, -PI / 2, [[-100, 108], [-100, 122]]]], 'police', { group: 'pc', model: 'police' });
        }),
        say([['RAVI (phone)', 'Salute anyone with stars on the shoulder. And DON\'T run.']]),
        hold(-112, 118, 2.2, 4, 'Walk to the record room and take Neta\'s file', { label: 'SEARCHING FILES' }),
        goTo(-112, 86, 4, 'Walk out of the station'),
        K.undisguise(),
        say([['VIKRAM', 'Neta pays half the station. And he meets his "partner" tomorrow at the seafront cafe.']]),
      ],
      onAlert: (g, m) => { if (!m.vars.alarmed) { m.vars.alarmed = true; g.dispatch.setStars(3); g.hud.showBig('THEY KNOW YOU ARE NOT A COP!', '#ff4438', 1.6); } },
    },
    {
      id: 39, title: 'Smile Please', atmo: 'day',
      brief: 'Neta\'s men meet a foreign buyer at the seafront cafe. Take photos of all four of them from a distance. If the bodyguards see you, it\'s over.',
      reward: 3300, par: [120, 200], next: 'Who is Neta\'s secret assistant?',
      intro: [{ at: [60, -219], yaw: PI, act: 'wait', cam: 'side', where: 'Seafront · 4:00 PM', text: 'Vikram bought a cheap camera from the Chor Bazaar. "Best zoom in Navapur," the seller swore.' }],
      steps: () => [
        place(70, -219, PI),
        act((g, m) => {
          m.vars.meet = [[36, -234, PI / 2, 'm_office'], [38, -234, -PI / 2, 'm_sweater'], [44, -235, PI, 'f_coat'], [41, -236.5, 0, 'm_denim']].map(([x, z, y, r]) => K.person(g, m, x, z, y, r, { gesture: 'talk' }));
          K.guards(g, m, [[30, -231, -PI / 2], [50, -231, PI / 2]], null, { group: 'bg', model: 'm_jacket' });
        }),
        K.photo((g, m) => m.vars.meet.map((p) => ({ x: p.x, y: 1.5, z: p.z })), 'Photograph everyone at the meeting', { range: 50 }),
        say([['RAVI (phone)', 'The foreigner is a money printer from abroad. Neta is in deep.']]),
      ],
      onAlert: (g, m) => m.fail('The bodyguards saw you'),
    },
    {
      id: 40, title: 'Phone Tapper', atmo: 'day',
      brief: 'One of the office workers in the plaza is Neta\'s assistant. Talk to them - their profile cards give it away. Then stand near the assistant for 5 seconds to copy their phone.',
      reward: 3400, par: [140, 220], next: 'The accountant wants to testify - if he lives.',
      intro: [{ at: [37.5, -20], yaw: PI, act: 'phone', cam: 'front', where: 'Downtown plaza · 1:00 PM', text: 'Ravi built a phone copier from an old power bank. "Stay close for five seconds. Don\'t look suspicious, bhai."' }],
      steps: () => [
        place(37.5, -26, PI),
        K.askAround([
          { at: [30, -34], yaw: PI / 2, rig: 'f_coat', gesture: 'phone', line: 'Neta ji ki PA? Woh lal kapdon wali madam hain - dekho fountain ke paas.' },
          { at: [45, -32], yaw: -PI / 2, rig: 'm_office', gesture: 'talk', line: 'Main bank mein hoon, politics se door rehta hoon.' },
          { at: [33, -45], yaw: 0, rig: 'f_pink', gesture: 'phone', line: 'Haan main Neta ji ki PA hoon. Kyon pooch rahe ho?! (Copy her phone!)', key: true },
          { at: [44, -44], yaw: PI, rig: 'm_sweater', gesture: 'listen', line: 'PA? Woh hamesha phone pe rehti hai, pink kurta.' },
        ], 'Find Neta\'s assistant: talk to the office workers'),
        hold(33, -44, 2.5, 5, 'Stay next to the assistant to copy her phone', { label: 'COPYING PHONE' }),
        say([['RAVI (phone)', 'Got everything! Messages, bank... and a meeting with the accountant who wants to talk.']]),
      ],
    },
    {
      id: 41, title: 'The Witness', atmo: 'day',
      brief: 'Neta\'s accountant will testify. Walk him from the bank to the court (downtown plaza). Neta\'s shooters will try to stop you.',
      reward: 4000, par: [150, 240], next: 'Neta holds an election rally tomorrow.',
      intro: [{ at: [-37.5, -50], yaw: 0, act: 'talk', cam: 'front', where: 'Central Bank · 11:50 AM', with: [{ rig: 'm_office', f: 1.6, act: 'listen' }],
        text: 'Mr. Desai, the accountant, was sweating: "If I reach that court, Neta is finished. If I don\'t... so am I."' }],
      steps: () => [
        place(-37.5, -50, 0),
        act((g, m) => { m.vars.vip = K.person(g, m, -36, -52, 0, 'm_office'); }),
        say([['DESAI', 'Please, stay close to me. They are everywhere.']]),
        act((g, m) => gang(g, m, [[-20, -40], [-10, -30], [-15, -20]], { group: 'w1' })),
        K.escort('vip', [37.5, -37.5], 'Escort Mr. Desai to the court (downtown plaza)', { label: 'MR. DESAI', hp: 120 }),
        act((g) => g.rewards.event('WITNESS DELIVERED', 1500, 80)),
        say([['DESAI', 'I will tell the judge everything. Thank you, Vikram.']]),
      ],
    },
    {
      id: 42, title: 'Election Rally', atmo: 'day',
      brief: 'Neta\'s election rally in the park. Blend into the crowd by chanting on the beat, get close to the stage and hide a recorder under it.',
      reward: 3500, par: [120, 200], next: 'Neta\'s driver is about to have a very bad day.',
      intro: [{ at: [-112, 22], yaw: 0, act: 'cheer', cam: 'front', where: 'West Park · 5:00 PM', text: 'Thousands came for free biryani and Neta\'s speech. Vikram came with a voice recorder in his sock.' }],
      steps: () => [
        place(-112, 26, 0),
        act((g, m) => {
          for (let i = 0; i < 14; i++) { const p = K.person(g, m, -112 + (Math.random() - 0.5) * 14, 34 + Math.random() * 10, PI, null, { gesture: i % 3 ? 'cheer' : 'dance' }); p.calm = true; }
          const stage = new H.THREE.Mesh(new H.THREE.BoxGeometry(9, 1.1, 4), new H.THREE.MeshStandardMaterial({ color: 0xff8c1a })); stage.position.set(-112, 0.7, 52); g.scene.add(stage); m.track(stage);
          m.vars.neta = K.person(g, m, -112, 52, PI, 'm_office', { gesture: 'talk' }); m.vars.neta.groundY = 1.25;
        }),
        K.beat(8, 'Chant with the crowd on the beat', { button: 'CHANT', label: 'NETA JI ZINDABAD! Tap CHANT on the beat', bpm: 92 }),
        hold(-109, 49.5, 2.2, 3, 'Slip under the stage and hide the recorder', { label: 'HIDING RECORDER' }),
        goTo(-112, 20, 4, 'Walk away with the crowd'),
        say([['RAVI (phone)', 'Recording! He is promising "free money" - fake money, ha!']]),
      ],
    },
    {
      id: 43, title: 'The Driver', atmo: 'day',
      brief: 'Silently take down Neta\'s driver while Neta is in a meeting, wear his suit, and drive Neta\'s car to Ravi\'s garage - without a scratch.',
      reward: 3800, par: [140, 220], next: 'Neta\'s assistant runs with the laptop!',
      intro: [{ at: [77.5, -30], yaw: PI, act: 'look', cam: 'front', where: 'Downtown · 2:10 PM', text: 'Every Tuesday, Neta\'s driver smokes behind the car park for exactly ten minutes. Vikram had timed it.' }],
      steps: () => [
        place(81, -20, PI),
        act((g, m) => {
          m.vars.drv = g.spawnOfficer(81.5, -40, PI, null, { gang: true, model: 'm_office', weapon: 'pistol', patrol: [[81.5, -40], [81.5, -48]], group: 'drv' });
          m.track(m.vars.drv); m.vars.drvN = 1;
          parkedCar(g, m, 'suv', 0x0d0d0f, 81.4, -58, 0, 'neta');
        }),
        killGroup('drv', 'Take down the driver from behind (sneak up, tap TAKEDOWN)'),
        K.disguise('m_office', 'office', 'DRIVER'),
        getIn('neta', 'Get in Neta\'s black SUV'),
        K.deliver('neta', H.GARAGE.x, H.GARAGE.z, 6, 'Drive Neta\'s car to Ravi\'s garage', { minHealth: 70 }),
        K.undisguise(),
        say([['RAVI', 'Neta\'s own car... full of documents. Bhai, you are a genius.']]),
      ],
    },
    {
      id: 44, title: 'Laptop Chase', atmo: 'day',
      brief: 'Neta\'s assistant escapes in a car with the laptop. Ram the car until it stops, grab the laptop and lose the police.',
      reward: 4000, par: [120, 200], next: 'Quiet or loud? The party office.',
      intro: [{ at: [6, 6.5], yaw: -PI / 2, act: 'phone', cam: 'side', where: 'Start block · 9:00 AM', text: 'Ravi\'s phone copy pinged: "Laptop leaving the office NOW." Vikram was already running to the car.' }],
      steps: () => [
        act((g, m) => { const c = parkedCar(g, m, 'sports', 0x1d70b8, 6.4, 14, 0, 'car'); g.placePlayer(6.4, 11, 0); g.driving.enter(c); g.camera3p.snapBehind(); missionCar(g, m, 'sedan', 0xf2f2f2, { mode: 'flee', health: 200, hostile: true, name: 'pa', speed: 20 }, { node: true, x: 40, z: 2.25, hx: 1, hz: 0 }); m.vars.pa.maxHealth = 200; }),
        destroy('pa', 'Stop the assistant\'s car (ram it / shoot it)', { label: 'ASSISTANT\'S CAR' }),
        act((g, m) => { const c = m.vars.pa; m.vars.laptop = m.track(g.pickups.spawn('intel', c.x + 2, c.z + 2, { auto: true, car: false })); g.dispatch.setStars(3); }),
        collect('lp', [], 'Grab the laptop', {}),
        waitFor('Grab the laptop from the wreck', (g, m) => m.vars.laptop.taken),
        loseCops('Lose the police with the laptop'),
        say([['RAVI (phone)', 'Laptop safe! Neta\'s whole fake money network is on it.']]),
      ],
    },
    {
      id: 45, title: 'Inside Man', atmo: 'night',
      brief: 'Neta\'s party office has the master plates for the fake notes. Go in QUIET as a cleaner - or LOUD with guns. Your choice changes the mission.',
      reward: 4500, par: [150, 260], next: 'Neta is running. End it.',
      intro: [{ at: [-68.5, -37], yaw: PI / 2, act: 'talk', cam: 'front', where: 'Ravi\'s garage · 10:00 PM', with: [{ rig: 'ravi', f: 1.6, act: 'listen' }],
        text: 'Ravi spread the plans on the bonnet. "Cleaners go in at 11. Or... we just go in shooting." Vikram smiled.' }],
      steps: () => [
        place(-6.5, 25, -PI / 2),
        K.choose('How do you get the master plates?', 'QUIET: go in as a cleaner', 'LOUD: fight your way in',
          () => [
            K.disguise('m_worker', 'cleaner', 'CLEANER'),
            act((g, m) => { K.guards(g, m, [[-38, 34, 0], [-30, 28, PI], [-36, 40, PI / 2, [[-36, 40], [-46, 40]]]], 'cleaner', { group: 'po', model: 'm_office' }); }),
            hold(-33, 32, 2.2, 5, 'Walk to the office and take the plates', { label: 'TAKING PLATES' }),
            goTo(-6.5, 25, 3, 'Walk out quietly (east side gap)'),
            K.undisguise(),
          ],
          () => [
            act((g, m) => gang(g, m, [[-38, 34], [-30, 28], [-36, 40], [-26, 38], [-40, 26], [-30, 22]], { group: 'pl', weapon: 'smg' })),
            killGroup('pl', 'Fight through the party office'),
            hold(-33, 32, 2.2, 3, 'Take the master plates', { label: 'TAKING PLATES' }),
            act((g) => g.dispatch.setStars(3)),
            loseCops('Lose the police'),
          ]),
        say([['RAVI', 'The plates! Without these, Neta is just a man with a loud voice.']]),
      ],
      rate: (g, m) => (m.vars.choice === 'a' ? 3 : m.elapsed < 200 ? 3 : 2),
    },
    {
      id: 46, title: 'Neta Ji', atmo: 'day', chapterEnd: 5,
      brief: 'Neta Bhanwar Lal is fleeing the city in a convoy. Wreck his two escort cars, stop his car, and catch him on foot.',
      reward: 6500, par: [200, 320], next: 'Collector Kapoor wants the best car thief in Navapur.',
      intro: [{ at: [-36, -15], yaw: PI, act: 'phone', cam: 'side', where: 'Downtown · 7:00 AM', text: 'The news broke at dawn: "Neta flees Navapur!" Vikram had one minute to reach the highway road.' }],
      steps: () => [
        act((g, m) => {
          const c = parkedCar(g, m, 'sports', 0xd62828, -40, -2.25, PI / 2, 'car'); g.placePlayer(-40, 1, PI / 2); g.driving.enter(c); g.camera3p.snapBehind();
          missionCar(g, m, 'suv', 0x101010, { mode: 'flee', health: 160, hostile: true, fastBurn: true, name: 'e1', speed: 19 }, { node: true, x: 30, z: 2.25, hx: 1, hz: 0 });
          missionCar(g, m, 'suv', 0x101010, { mode: 'flee', health: 160, hostile: true, fastBurn: true, name: 'e2', speed: 19 }, { node: true, x: 60, z: -2.25, hx: -1, hz: 0 });
          missionCar(g, m, 'sedan', 0xf4f4f4, { mode: 'flee', health: 220, hostile: true, name: 'netaCar', speed: 18 }, { node: true, x: 80, z: 2.25, hx: 1, hz: 0 });
          for (const k of ['e1', 'e2', 'netaCar']) m.vars[k].maxHealth = m.vars[k].health;
        }),
        destroy('e1', 'Wreck the first escort car', { label: 'ESCORT 1', maxDist: 320 }),
        destroy('e2', 'Wreck the second escort car', { label: 'ESCORT 2', maxDist: 320 }),
        destroy('netaCar', 'Stop Neta\'s car!', { label: 'NETA\'S CAR', maxDist: 320 }),
        act((g, m) => { const c = m.vars.netaCar; m.vars.neta = K.person(g, m, c.x + 2, c.z + 2, 0, 'm_office'); }),
        K.footChase('neta', (g, m) => { const c = m.vars.netaCar, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), cl = (v) => Math.max(-215, Math.min(215, v)); return [[cl(c.x + fx * 30), cl(c.z + fz * 30)], [cl(c.x + fx * 70), cl(c.z + fz * 70)], [cl(c.x + fx * 110), cl(c.z + fz * 110)]]; }, 'Catch Neta on foot!', { speed: 4.3 }),
        act((g) => { g.slowmo(1.4, 0.25); g.hud.showBig('NETA IS FINISHED', '#ffc531', 2.5); g.rewards.event('NETA CAUGHT', 2500, 160); }),
      ],
    },

    // ===================== CHAPTER 6: FAST AND DESI =====================
    {
      id: 47, title: 'Shopping List', atmo: 'day',
      brief: 'Collector Kapoor buys stolen cars. His list: a yellow sports car, a black SUV and a white taxi. Bring each one to his garage - not too damaged.',
      reward: 4000, par: [240, 360], next: 'Kapoor\'s cash travels by city bus...',
      intro: [{ at: [185, 108], yaw: 0, act: 'listen', cam: 'front', where: 'Kapoor\'s garage · 11:00 AM', with: [{ rig: 'm_office', f: 1.8, act: 'talk' }],
        text: 'Collector Kapoor polished his gold watch: "I don\'t steal cars, Vikram. I COLLECT them. You do the boring part."' }],
      steps: () => [
        place(180, 108, 0),
        K.stealList([
          { name: 'yellow sports car', type: 'sports', color: 0xf2c21b, at: [118, 81.3], yaw: PI / 2 },
          { name: 'black SUV', type: 'suv', color: 0x0d0d0f, at: [81.3, 140], yaw: 0 },
          { name: 'white taxi', type: 'taxi', color: 0xffffff, at: [140, 156.3], yaw: -PI / 2 },
        ], [187.5, 79], 'Steal the cars on Kapoor\'s list', { minHealth: 50, toName: 'Kapoor\'s garage', pay: 900 }),
        say([['KAPOOR (phone)', 'Beautiful. You have taste, Vikram. Now I have a REAL job for you.']]),
      ],
    },
    {
      id: 48, title: 'Line 7', atmo: 'day',
      brief: 'Drive the city bus on route 7: stop at four bus stops and let people get in. Kapoor\'s men are on the route...',
      reward: 3600, par: [240, 360], next: 'A crash on the seafront. People need a hospital NOW.',
      intro: [{ at: [-70, 6.5], yaw: PI / 2, act: 'talk', cam: 'front', where: 'Bus depot · 6:00 AM', with: [{ rig: 'm_sweater', f: 1.6, act: 'listen' }],
        text: 'Kapoor\'s cash moves inside Line 7\'s money box. The real driver was "sick" today - thanks to a big plate of Ravi\'s biryani.' }],
      steps: () => [
        act((g, m) => { const b = parkedCar(g, m, 'bus', 0, -60, -2.25, PI / 2, 'bus'); g.placePlayer(-60, -5.6, PI / 2); g.driving.enter(b); g.camera3p.snapBehind(); }),
        K.passengers('bus', [
          { at: [-20, -6.6], n: 3, dest: [44, -6.6], destName: 'stop 2' },
          { at: [50, -6.6], n: 2, dest: [81.4, 40], destName: 'stop 3' },
          { at: [81.4, 50], n: 3, dest: [40, 81.4], destName: 'stop 4', say: [['PASSENGER', 'Driver sahab! Woh gaadi humein takkar maar rahi hai!']] },
          { at: [30, 81.4], n: 2, dest: [-30, 81.4], destName: 'last stop' },
        ], 'Bus route 7', { fare: 120 }),
        act((g) => g.rewards.event('ROUTE COMPLETE', 800, 50)),
        say([['RAVI (phone)', 'Money box swapped with ours. Kapoor won\'t notice till evening!']]),
      ],
      watch: (g, m, dt) => {
        if (!m.vars.rammers && m.si >= 2 && m.elapsed > 60) {
          m.vars.rammers = true;
          missionCar(g, m, 'suv', 0x3a3a3a, { mode: 'deploy', speed: 17, health: 120, hostile: true, fastBurn: true }, { node: true, x: 75, z: 70, hx: 0, hz: 1 });
        }
      },
    },
    {
      id: 49, title: 'Golden Hour', atmo: 'day', timer: 260,
      brief: 'A pile-up on the seafront. Three injured people need the hospital fast. Drive the ambulance - every second counts.',
      reward: 4200, par: [150, 220], next: 'Kapoor challenges you to a drag race.',
      intro: [{ at: [10, -219], yaw: PI, act: 'phone', cam: 'side', where: 'Seafront · 8:00 PM', text: 'Vikram heard the crash from the promenade. No ambulance driver in sight - just the keys, still in the ignition.' }],
      steps: () => [
        act((g, m) => {
          sign(g, m, PL.hosp[0], 7.2);
          const a = parkedCar(g, m, 'ambulance', 0, 20, -222.75, -PI / 2, 'amb'); g.placePlayer(22, -219, -PI / 2); g.driving.enter(a); g.camera3p.snapBehind();
          for (const [x, z, y] of [[-30, -224, 0.6], [-35, -226, -0.8]]) { const c = g.spawnParkedCar('sedan', 0x777777, x, z, y); c.missionCar = true; c.hold = true; m.track(c); }
        }),
        K.passengers('amb', [
          { at: [-30, -230.4], kind: 'injured', dest: PL.hosp, destName: 'City Hospital' },
          { at: [-42, -230.4], kind: 'injured', dest: PL.hosp, destName: 'City Hospital' },
          { at: [-58, -230.4], kind: 'injured', dest: PL.hosp, destName: 'City Hospital' },
        ], 'Ambulance', { fare: 500, deliverText: () => 'Rush to City Hospital (red cross sign)!' }),
        say([['DOCTOR', 'All three will live. Who ARE you?']]),
      ],
    },
    {
      id: 50, title: 'Drag King', atmo: 'night',
      brief: 'Kapoor\'s drag race on Marine Drive: straight line, full throttle, perfect BOOST. Beat his three best drivers.',
      reward: 3800, par: [40, 60], next: 'Kapoor\'s parts are hidden in a goods truck.',
      intro: [{ at: [190, -219], yaw: -PI / 2, act: 'look', cam: 'front', where: 'Marine Drive · 1:00 AM', with: [{ rig: 'm_office', f: 2, r: 1, act: 'talk' }],
        text: 'Kapoor: "Win, and I give you my garage keys. Lose, and I keep your car." The crowd went quiet.' }],
      steps: () => [
        act((g, m) => {
          g.raceGo = false; g.raceHold = true;
          const c = parkedCar(g, m, 'sports', 0x7a1f2b, 195, -222.8, -PI / 2, 'mine'); g.placePlayer(197, -219, -PI / 2); g.driving.enter(c);
          const cps = [{ x: 60, z: -225 }, { x: -80, z: -225 }];
          m.vars.cps = cps;
          m.vars.racers = [[195, -227.2], [201, -222.8], [201, -227.2]].map(([x, z], i) =>
            missionCar(g, m, 'sports', [0x1d1e22, 0xf2f2f2, 0x22468f][i], { mode: 'race', cps, top: 36 + i, skill: 1, lane: i === 1 ? 0 : (i ? 2.2 : -2.2), health: 400 }, { x, z, yaw: -PI / 2 }));
          g.camera3p.snapBehind();
        }),
        countdown(),
        race([{ x: 60, z: -225 }, { x: -80, z: -225 }], 'DRAG RACE! Full gas + BOOST'),
        say([['KAPOOR', 'Hmph. Fine. You are the fastest in Navapur... for now.']]),
      ],
      rate: (g, m) => (m.elapsed < 40 ? 3 : m.elapsed < 60 ? 2 : 1),
    },
    {
      id: 51, title: 'Truck Jack', atmo: 'day',
      brief: 'A goods truck carries Kapoor\'s stolen car parts. Box it in and damage it until it stops, take the wheel, and drive it to the docks.',
      reward: 4000, par: [200, 300], next: 'Kapoor jams the whole city to catch you.',
      intro: [{ at: [-150, 70], yaw: 0, act: 'wait', cam: 'side', where: 'West road · 3:00 PM', text: 'The truck always took the west road at three. Vikram waited at the corner, engine running.' }],
      steps: () => [
        act((g, m) => {
          const c = parkedCar(g, m, 'suv', 0x2e5e45, -147.75, 60, 0, 'car'); g.placePlayer(-145, 58, 0); g.driving.enter(c); g.camera3p.snapBehind();
          const t = missionCar(g, m, 'truck', 0, { mode: 'flee', health: 260, name: 'truck', speed: 15 }, { node: true, x: -152.25, z: 110, hx: 0, hz: -1 });
          t.maxHealth = 260; t.noExplode = true;
        }),
        {
          start: (g, m) => { m.objective('Damage the truck until it stops (ram it)'); m.music = 2; },
          update: (g, m) => {
            const t = m.vars.truck;
            m.marker(t.x, t.z, 4, true);
            g.hud.setBoss('GOODS TRUCK', Math.max(0, t.health - 100) / 160);
            if (t.health <= 100) { t.mode = 'tail'; t.hold = true; t.cruise = 0; t.health = 100; t.wrecked = false; return true; }
            return false;
          },
          end: (g, m) => { g.hud.setBoss(null); m.marker(null); m.music = 1; },
        },
        act((g, m) => { const t = m.vars.truck; t.parked = true; t.missionCar = true; t.hold = true; g.hud.toast('The driver ran away! Take the truck'); }),
        getIn('truck', 'Get in the truck'),
        K.deliver('truck', PL.docks[0], -225, 8, 'Drive the truck to the docks (seafront east)', {}),
        say([['RAVI (phone)', 'Parts worth 50 lakh! Kapoor is going to explode.']]),
      ],
    },
    {
      id: 52, title: 'Gridlock', atmo: 'day',
      brief: 'Kapoor paid the traffic police: the whole city is jammed and 4 stars are on you. Escape using footpaths, alleys and the beach.',
      reward: 4200, par: [90, 160], next: 'A demolition derby in the streets!',
      intro: [{ at: [6, 6.5], yaw: PI, act: 'phone', cam: 'front', where: 'Start block · 5:00 PM', text: 'Kapoor\'s message was one word: "Gridlock." Then every signal in Navapur turned red at once.' }],
      steps: () => [
        act((g, m) => { const c = parkedCar(g, m, 'hatchback', 0x9e1b1b, 6.4, 14, 0, 'car'); g.placePlayer(6.4, 11, 0); g.driving.enter(c); g.camera3p.snapBehind(); for (const x of g.cars) if (!x.missionCar && !x.isPolice) x.hold = true; g.jammed = true; }),
        act((g) => g.dispatch.setStars(4)),
        loseCops('ESCAPE! The roads are jammed - use footpaths, alleys and the beach'),
        act((g) => { for (const x of g.cars) if (!x.isPolice && !x.wrecked) x.hold = false; g.jammed = false; }),
        say([['RAVI (phone)', 'Through the jam with four stars? You are not human, bhai!']]),
      ],
      rate: (g, m) => (m.elapsed < 90 ? 3 : m.elapsed < 160 ? 2 : 1),
    },
    {
      id: 53, title: 'Smash Derby', atmo: 'day', timer: 150,
      brief: 'Kapoor\'s gang cars hunt you through the streets. Wreck eight of them before time runs out. Ramming, shooting, anything goes.',
      reward: 4400, par: [90, 130], next: 'Kapoor races at night with the lights off.',
      intro: [{ at: [-150, 6.5], yaw: PI / 2, act: 'look', cam: 'front', where: 'West road · 2:00 PM', text: 'Ravi welded steel plates onto the old SUV all night. "Now they can hit you as much as they want."' }],
      onEvent: (g, m, type) => { if (type === 'explosion') m.vars.wrecked = (m.vars.wrecked || 0) + 1; },
      steps: () => [
        act((g, m) => { const c = parkedCar(g, m, 'suv', 0x4a4d52, -150, 2.25, PI / 2, 'car'); c.health = 400; c.maxHealth = 400; g.placePlayer(-150, 5.2, PI / 2); g.driving.enter(c); g.camera3p.snapBehind(); m.vars.wrecked = 0; }),
        {
          start: (g, m) => { m.objective('Wreck 8 gang cars'); m.music = 3; m.vars.spawnT = 0; },
          update: (g, m, dt) => {
            m.vars.spawnT -= dt;
            const live = m.ents.filter((e) => e.isCar && e.mode === 'deploy' && !e.exploded).length;
            if (m.vars.spawnT <= 0 && live < 3) {
              m.vars.spawnT = 3;
              const pts = [[-75, 40, 0, 1], [-150, 60, 0, -1], [-110, 75, 1, 0], [-180, 0, 1, 0]];
              const [x, z, hx, hz] = pts[Math.floor(Math.random() * pts.length)];
              const c = missionCar(g, m, pick2(['sedan', 'hatchback', 'suv']), 0x202020, { mode: 'deploy', speed: 18, health: 90, hostile: true, fastBurn: true }, { node: true, x, z, hx, hz });
              c.pursuing = true;
            }
            m.objective(`Wreck gang cars: ${m.vars.wrecked} / 8`);
            return m.vars.wrecked >= 8;
          },
          end: (g, m) => { m.music = 1; },
        },
        say([['RAVI (phone)', 'Eight cars! Kapoor\'s insurance company is crying.']]),
      ],
    },
    {
      id: 54, title: 'Lights Out Racing', atmo: 'blackout',
      brief: 'Kapoor\'s secret race: the street lights are cut, only your headlights show the way. Win.',
      reward: 4200, par: [80, 100], next: 'Kapoor attacks the relief trucks. Protect them!',
      intro: [{ at: [190, -219], yaw: -PI / 2, act: 'wait', cam: 'front', where: 'Marine Drive · 2:00 AM', text: 'Midnight. Kapoor\'s men pulled the main switch. "Real drivers don\'t need street lights," he grinned.' }],
      steps: () => [
        act((g, m) => {
          g.raceGo = false; g.raceHold = true;
          const c = parkedCar(g, m, 'sports', 0xf2f2f2, 195, -222.8, -PI / 2, 'mine'); g.placePlayer(197, -219, -PI / 2); g.driving.enter(c);
          m.vars.racers = [[195, -227.2], [201, -222.8], [201, -227.2]].map(([x, z], i) =>
            missionCar(g, m, 'sports', [0xd62828, 0x1d70b8, 0xf2c21b][i], { mode: 'race', cps: H.RACE_CPS, top: 33 + i, skill: 0.95 + i * 0.03, lane: i === 1 ? 0 : (i ? 2.2 : -2.2), health: 400 }, { x, z, yaw: -PI / 2 }));
          g.camera3p.snapBehind();
        }),
        countdown(),
        race(H.RACE_CPS, 'WIN THE BLACKOUT RACE'),
        say([['KAPOOR', 'You see in the dark like a cat, Vikram.']]),
      ],
      rate: (g, m) => (m.elapsed < 80 ? 3 : m.elapsed < 100 ? 2 : 1),
    },
    {
      id: 55, title: 'Relief Convoy', atmo: 'day',
      brief: 'Three relief trucks carry food to the flood camp. Kapoor\'s men want to hijack them. Escort the convoy - if one truck is destroyed, it\'s over.',
      reward: 4500, par: [180, 260], next: 'Final showdown with Collector Kapoor.',
      intro: [{ at: [-37.5, -18], yaw: 0, act: 'talk', cam: 'front', where: 'Relief camp · 9:00 AM', with: [{ rig: 'f_salwar', f: 1.6, act: 'listen' }],
        text: 'The camp lady had tears in her eyes: "Two hundred families wait for these trucks. Please bring them, beta."' }],
      steps: () => [
        act((g, m) => {
          const c = parkedCar(g, m, 'suv', 0x2e5e45, 150, 66, 0, 'car'); g.placePlayer(153, 64, 0); g.driving.enter(c); g.camera3p.snapBehind();
          m.vars.trucks = [0, 1, 2].map((i) => { const t = missionCar(g, m, 'truck', 0, { mode: 'tail', speed: 9, dest: { x: -40, z: 2.25 }, destDir: { x: -1, z: 0 }, health: 240 }, { node: true, x: 147.75, z: 90 + i * 16, hx: 0, hz: -1 }); t.maxHealth = 240; t.obeySignals = false; return t; });
          // A real convoy: the trucks behind follow the leader's road, not their own shortcuts.
          const lead = m.vars.trucks[0];
          for (const t of m.vars.trucks.slice(1)) { const path = g.network.findPath(t.target, lead.target); if (path) t.upcoming = [...path.slice(1), ...lead.upcoming]; }
        }),
        {
          start: (g, m) => { m.objective('Escort the relief trucks to the camp'); m.music = 2; m.vars.attT = 8; },
          update: (g, m, dt) => {
            const tr = m.vars.trucks;
            if (tr.some((t) => t.exploded)) { m.fail('A relief truck was destroyed'); return false; }
            m.vars.attT -= dt;
            if (m.vars.attT <= 0 && m.ents.filter((e) => e.isCar && e.mode === 'deploy' && !e.exploded).length < 2) {
              m.vars.attT = 14;
              const t = tr[Math.floor(Math.random() * tr.length)];
              const c = missionCar(g, m, 'sedan', 0x111111, { mode: 'deploy', speed: 17, health: 90, hostile: true, fastBurn: true }, { node: true, x: t.x + 40, z: t.z, hx: -1, hz: 0 });
              c.pursuing = true;
              g.hud.toast('HIJACKERS INCOMING!');
            }
            const lead = tr[0];
            m.marker(lead.x, lead.z, 4, true);
            g.hud.setBoss('CONVOY', tr.reduce((a, t) => a + Math.max(0, t.health), 0) / (tr.length * 240));
            return tr.every((t) => t.arrived || Math.hypot(t.x + 40, t.z - 2.25) < 28);   // the camp gate is wide
          },
          end: (g, m) => { g.hud.setBoss(null); m.marker(null); m.music = 1; },
        },
        say([['CAMP LADY', 'God bless you! Everyone will eat tonight.']]),
      ],
    },
    {
      id: 56, title: 'The Collector', atmo: 'day', chapterEnd: 6,
      brief: 'Kapoor comes for you in his armoured SUV. Wreck it, then finish him on foot.',
      reward: 7000, par: [180, 300], next: 'Festival season... and Rana is back.',
      intro: [{ at: [187.5, 100], yaw: 0, act: 'phone', cam: 'side', where: 'Kapoor\'s garage · 6:00 PM', text: 'Kapoor\'s last call: "You stole from a collector, Vikram. Now I collect YOU." His engine roared in the background.' }],
      steps: () => [
        act((g, m) => {
          const c = parkedCar(g, m, 'sports', 0xf2c21b, 147.75, 100, 0, 'car'); g.placePlayer(145, 98, 0); g.driving.enter(c); g.camera3p.snapBehind();
          const k = missionCar(g, m, 'suv', 0x101010, { mode: 'deploy', speed: 21, health: 600, hostile: true, name: 'kcar' }, { node: true, x: 152.25, z: 140, hx: 0, hz: -1 });
          k.maxHealth = 600; k.pursuing = true;
        }),
        destroy('kcar', 'Wreck Kapoor\'s armoured SUV', { label: 'KAPOOR\'S ARMOURED SUV', maxDist: 300 }),
        act((g, m) => { const c = m.vars.kcar; boss(g, m, 'COLLECTOR KAPOOR', c.x + 3, c.z + 3, { model: 'm_office', health: 700, weapon: 'shotgun' }); gang(g, m, [[c.x - 4, c.z + 5], [c.x + 6, c.z - 4]], { group: 'kg', weapon: 'smg' }); }),
        say([['KAPOOR', 'My car! MY BEAUTIFUL CAR!']]),
        bossFight('boss', 'Take down COLLECTOR KAPOOR'),
        act((g) => { g.slowmo(1.4, 0.25); g.hud.showBig('THE COLLECTOR IS COLLECTED', '#ffc531', 2.5); g.rewards.event('KAPOOR FINISHED', 2500, 170); }),
      ],
    },

    // ===================== CHAPTER 7: FESTIVAL CITY =====================
    {
      id: 57, title: 'Diwali Dhamaka', atmo: 'night', timer: 180,
      brief: 'Rana\'s men hid four bombs among the Diwali cracker stalls in the East Bazaar. Find them (red pins) and defuse them before midnight.',
      reward: 4200, par: [100, 150], next: 'Spy drones are watching the rooftops.',
      intro: [{ at: [110, -101], yaw: PI, act: 'drink', cam: 'front', where: 'East Bazaar · 11:00 PM', text: 'Diwali night. Vikram was buying phuljhadi for Ravi\'s little sister when the anonymous call came: "Four bombs. Midnight. Rana says hello."' }],
      steps: () => [
        place(110, -101, PI),
        defuse([[100, -108], [124, -104], [110, -124], [122, -122]], 3, 'Find and defuse the bombs among the stalls', { label: 'BOMB DEFUSED', doing: 'DEFUSING' }),
        act((g) => { g.slowmo(1.2, 0.3); g.hud.showBig('HAPPY DIWALI, NAVAPUR!', '#ffc531', 2.5); }),
        say([['RAVI (phone)', 'Rana is back, bhai. And this time he wants the whole city to watch.']]),
      ],
    },
    {
      id: 58, title: 'Patang Baazi', atmo: 'day',
      brief: 'Makar Sankranti: the sky is full of kites... and Rana\'s spy drones. Shoot down all six. If a drone\'s light finds you, the police come.',
      reward: 4000, par: [120, 200], next: 'Garba night: Rana\'s money man will be dancing.',
      intro: [{ at: [37.5, 30], yaw: PI, act: 'cheer', cam: 'high', where: 'Rooftops · 2:00 PM', text: 'Kite festival! Everyone was on the roofs shouting "KAI PO CHE!" - and Vikram noticed some "kites" had red lights.' }],
      steps: () => [
        place(37.5, 30, PI),
        K.drones([[37.5, 37.5, 7, 9], [30, 30, 3.5, 8], [45, 45, 3.5, 10], [37.5, 0, 5, 9], [0, 37.5, 5, 9], [37.5, 75, 5, 9]], 'Shoot down the spy drones'),
        say([['RAVI (phone)', 'Six drones in the sky, zero in the sky now. Rana is blind!']]),
      ],
    },
    {
      id: 59, title: 'Garba Night', atmo: 'night',
      brief: 'Navratri garba in the North Bazaar. Dance on the beat to blend into the circle, then pickpocket Rana\'s money man while everyone spins.',
      reward: 4000, par: [120, 200], next: 'A gully cricket final... with a golden trophy.',
      intro: [{ at: [37.5, 100], yaw: 0, act: 'dance', cam: 'front', where: 'North Bazaar · 9:00 PM', text: 'Vikram had practised garba with Ravi\'s mother all week. "Left, clap, right, clap... beta, you dance like a policeman!"' }],
      onEvent: (g, m, type, data) => K.countRobs(g, m, type, data),
      steps: () => [
        place(37.5, 104, 0),
        act((g, m) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; const p = K.person(g, m, 37.5 + Math.cos(a) * 7, 112.5 + Math.sin(a) * 7, a + PI / 2, null, { gesture: 'dance' }); p.calm = true; } }),
        K.beat(8, 'Dance garba on the beat', { button: 'DANDIYA', label: 'GARBA! Tap DANDIYA on the beat', bpm: 104 }),
        K.pickpocket([{ at: [42, 116], yaw: PI, rig: 'm_office', name: 'Mehta (Rana\'s money man)', job: 'Hawala banker', cash: 2500, gesture: 'dance' }], 'Pickpocket Rana\'s money man', { failOnCaught: 'He saw you! The cover is blown' }),
        say([['RAVI (phone)', 'His phone has Rana\'s whole festival plan!']]),
      ],
    },
    {
      id: 60, title: 'Gully Cricket', atmo: 'day',
      brief: 'The gully cricket final in the park has a golden trophy - Rana\'s. Bat on the beat (6 good shots) to stay in the game, then grab the trophy and run.',
      reward: 4000, par: [120, 200], next: 'Ganpati visarjan: protect the idol.',
      intro: [{ at: [187.5, 26], yaw: 0, act: 'cheer', cam: 'front', where: 'East Park · 4:00 PM', text: 'The local boys needed one more batsman for the final. Vikram\'s school cricket finally had a use.' }],
      steps: () => [
        place(187.5, 30, 0),
        act((g, m) => {
          for (let i = 0; i < 10; i++) { const p = K.person(g, m, 187.5 + (Math.random() - 0.5) * 24, 40 + (Math.random() - 0.5) * 16, PI, null, { gesture: i % 2 ? 'cheer' : 'wait' }); p.calm = true; }
          m.vars.trophy = m.track(g.pickups.spawn('gold', 193, 48, { auto: true, car: false }));
        }),
        K.beat(6, 'Bat on the beat: hit 6 shots', { button: 'BAT', label: 'CRICKET! Tap BAT when the ball reaches the line', bpm: 80 }),
        act((g) => { g.hud.showBig('SIXER!', '#ffc531', 1.5); g.rewards.event('MAN OF THE MATCH', 600, 40); }),
        waitFor('Grab the golden trophy!', (g, m) => m.vars.trophy.taken),
        act((g) => g.dispatch.setStars(2)),
        loseCops('Run with the trophy - lose the police'),
      ],
    },
    {
      id: 61, title: 'Bappa Morya', atmo: 'day',
      brief: 'Ganpati visarjan: the idol truck goes to the sea through the crowd. Rana\'s men try to stop it. Protect the procession all the way to the beach.',
      reward: 4400, par: [150, 240], next: 'The mela has a shooting gallery with a strange prize.',
      intro: [{ at: [6, 85], yaw: PI, act: 'cheer', cam: 'front', where: 'North road · 10:00 AM', with: [{ rig: 'ravi', f: 1.2, r: 1, act: 'dance' }],
        text: '"Ganpati Bappa Morya!" Ravi\'s colony was taking their idol to the sea, and Rana had sworn to ruin it.' }],
      watch: (g, m, dt) => H.allyFight(g, m, g.ravi, dt),
      steps: () => [
        act((g, m) => {
          const t = missionCar(g, m, 'truck', 0, { mode: 'tail', name: 'idol', speed: 3.5, dest: { x: 2.25, z: -215 }, destDir: { x: 0, z: -1 }, health: 99999 }, { node: true, x: 2.25, z: 70, hx: 0, hz: -1 });
          t.obeySignals = false; t.cruise = 3.5;
          g.placePlayer(6.5, 80, PI); crew(g, m, 6, 83);
        }),
        say([['RAVI', 'Ganpati Bappa Morya! Watch the crowd, bhai - Rana\'s men will come from the side streets.']]),
        {
          start: (g, m) => { m.objective('Protect the idol truck all the way to the sea'); m.music = 2; m.vars.waveT = 10; },
          update: (g, m, dt) => {
            const t = m.vars.idol;
            m.marker(t.x, t.z, 4, true);
            m.vars.waveT -= dt;
            if (m.vars.waveT <= 0) { m.vars.waveT = 18; K.thugs(g, m, [[t.x - 8, t.z - 14], [t.x + 9, t.z - 12]], { group: 'vs' }); g.hud.toast('RANA\'S MEN AHEAD!'); }
            const near = g.officers.filter((o) => o.group === 'vs' && !o.dead && Math.hypot(o.x - t.x, o.z - t.z) < 6).length;
            m.vars.harm = (m.vars.harm || 0) + near * dt;
            g.hud.setBoss('PROCESSION', Math.max(0, 1 - m.vars.harm / 25));
            if (m.vars.harm > 25) { m.fail('Rana\'s men stopped the procession'); return false; }
            if (Math.abs(g.player.x - t.x) + Math.abs(g.player.z - t.z) > 60) { m.objective('Stay with the procession!'); }
            return t.arrived;
          },
          end: (g, m) => { g.hud.setBoss(null); m.marker(null); m.music = 1; },
        },
        act((g) => { g.hud.showBig('GANPATI BAPPA MORYA!', '#ffc531', 2.5); g.rewards.event('VISARJAN DONE', 1000, 60); }),
      ],
    },
    {
      id: 62, title: 'Mela Masti', atmo: 'day',
      brief: 'The funfair shooting gallery\'s big prize is a key - the key to Rana\'s locker. Hit 15 targets in 45 seconds, then open the locker.',
      reward: 3800, par: [80, 140], next: 'Holi again - and Rana wants a rematch.',
      intro: [{ at: [-37.5, 172], yaw: 0, act: 'cheer', cam: 'front', where: 'North Park mela · 6:00 PM', text: 'Giant wheel, candy floss, and one stall nobody could win. The owner was Rana\'s cousin.' }],
      steps: () => [
        place(-37.5, 176, 0),
        act((g, m) => { const s = new H.THREE.Mesh(new H.THREE.BoxGeometry(10, 3, 0.4), new H.THREE.MeshStandardMaterial({ color: 0x7a1f2b })); s.position.set(-37.5, 1.5, 192); g.scene.add(s); m.track(s); }),
        K.targets([[-41, 2.2, 191.5, PI], [-37.5, 2.6, 191.5, PI], [-34, 2.2, 191.5, PI], [-39.5, 1.4, 191.5, PI], [-35.5, 1.4, 191.5, PI]], 15, 45, 'Shooting gallery: hit the targets'),
        act((g) => { g.hud.showBig('WINNER!', '#ffc531', 1.5); }),
        hold(-20, 195, 2, 4, 'Open Rana\'s locker behind the stalls', { label: 'OPENING LOCKER' }),
        say([['RAVI (phone)', 'Plans for the Diwali fireworks show... Rana is planning something huge.']]),
      ],
    },
    {
      id: 63, title: 'Holi Rematch', atmo: 'day',
      brief: 'Rana\'s men attack during Holi. Throw COLOR to blind them (they can\'t see through gulal) and take them all down.',
      reward: 4000, par: [120, 200], next: 'A rich wedding... and a jewellery locker.',
      intro: [{ at: [37.5, 100], yaw: 0, act: 'cheer', cam: 'front', where: 'North Bazaar · 11:00 AM', text: 'Ravi filled Vikram\'s pockets with colour packets. "Last Holi was fun, no? This time Rana is bringing friends."' }],
      steps: () => [
        place(37.5, 100, 0),
        act((g, m) => {
          g.holi = new H.ColorClouds(g);
          g.world.colorBlock = (a, b, c, d) => g.holi.blocks(a, b, c, d);
          g.world.colorInside = (x, z) => g.holi.clouds.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 0.85);
          g.colorBombs = 12;
          gang(g, m, [[28, 110], [47, 110], [30, 122], [45, 124], [37, 125], [25, 118]], { group: 'hr' });
        }),
        killGroup('hr', 'Blind them with COLOR and take them down'),
        say([['RAVI', 'Bura na mano, Holi hai! Ha ha!']]),
      ],
    },
    {
      id: 64, title: 'Shaadi Crasher', atmo: 'night',
      brief: 'A rich wedding at the beach hotel. Dress as a waiter, find which guest has the locker key (talk to them), pickpocket it, and take the jewellery.',
      reward: 4600, par: [150, 240], next: 'Lanterns across the city before the fireworks start.',
      onEvent: (g, m, type, data) => K.countRobs(g, m, type, data),
      intro: [{ at: [-37.5, -176], yaw: PI, act: 'wait', cam: 'front', where: 'Beach hotel · 8:00 PM', text: 'The wedding belonged to Rana\'s brother-in-law. Vikram found a waiter\'s uniform that almost fit.' }],
      steps: () => [
        place(-37.5, -176, PI),
        K.disguise('m_sweater', 'waiter', 'WAITER'),
        act((g, m) => { K.guards(g, m, [[-50, -178, PI / 2], [-25, -178, -PI / 2]], 'waiter', { group: 'wg', model: 'm_office' }); }),
        K.askAround([
          { at: [-48, -180], yaw: 0, rig: 'f_coat', gesture: 'talk', line: 'Locker ki chaabi? Mama ji ke paas hai, woh dance kar rahe hain!' },
          { at: [-28, -182], yaw: PI, rig: 'm_kurta', gesture: 'drink', line: 'Waiter, ek aur cold drink!' },
          { at: [-40, -194], yaw: PI / 2, rig: 'f_pink', gesture: 'cheer', line: 'Mama ji? Woh blue jacket mein, pool ke paas.', key: true },
        ], 'Find out who has the locker key: talk to the guests'),
        K.pickpocket([{ at: [-30, -196], yaw: -PI / 2, rig: 'm_jacket', name: 'Mama ji', job: 'Rana\'s brother-in-law', cash: 600, gesture: 'dance' }], 'Pickpocket the key from Mama ji', { failOnCaught: 'Mama ji caught you! Wedding over' }),
        hold(-37.5, -200, 2, 4, 'Open the jewellery locker', { label: 'OPENING LOCKER' }),
        goTo(-6.5, -175, 4, 'Walk out like a waiter (east side gap)'),
        K.undisguise(),
        say([['RAVI (phone)', 'Rana\'s family gold! And a letter: the fireworks show is a trap for the whole city.']]),
      ],
    },
    {
      id: 65, title: 'Lantern Run', atmo: 'night', timer: 200,
      brief: 'The fireworks show needs five lanterns lit across the city - the signal for your friends to clear the crowd. Collect and deliver them before the countdown ends.',
      reward: 4000, par: [120, 170], next: 'The fireworks show. Rana\'s last stand.',
      intro: [{ at: [6, 29], yaw: PI / 2, act: 'talk', cam: 'front', where: 'Raju Tea Stall · 9:00 PM', with: [{ rig: 'ravi', f: 1.5, act: 'listen' }, { rig: 'm_kurta', f: 1.2, r: -1, act: 'listen' }],
        text: 'The plan was simple: five lanterns, five friends. When they see the lights, they get the families away from the beach.' }],
      steps: () => [
        act((g, m) => { const c = parkedCar(g, m, 'hatchback', 0xf2c21b, 6.4, 14, 0, 'car'); g.placePlayer(6.4, 11, 0); g.driving.enter(c); g.camera3p.snapBehind(); }),
        collect('lan', [[-112.5, 6.5], [37.5, 81.5], [112.5, -81.5], [-187.5, -81.5], [187.5, 6.5]], 'Light the lanterns around the city (drive to the green pins)', { type: 'bag', car: true }),
        act((g) => { g.hud.showBig('ALL LANTERNS LIT', '#ffc531', 2); }),
        say([['RAVI (phone)', 'Families are leaving the beach. Now go get Rana.']]),
      ],
    },
    {
      id: 66, title: 'Fireworks Finale', atmo: 'night', chapterEnd: 7,
      brief: 'Rana\'s last stand at the beach fireworks show. Rockets explode all around. Take down his men, then Rana himself.',
      reward: 7500, par: [180, 300], next: 'The biggest job of your life: Navapur Central Bank.',
      intro: [{ at: [0, -236], yaw: PI, act: 'look', cam: 'wide', where: 'Beach · 11:55 PM', text: 'Five minutes to midnight. The beach was empty - thanks to the lanterns. Only Rana and his men were waiting.' }],
      watch: (g, m, dt) => {
        m.vars.fw = (m.vars.fw ?? 2) - dt;
        if (m.vars.fw <= 0) { m.vars.fw = 1.2 + Math.random() * 1.5; const x = g.player.x + (Math.random() - 0.5) * 50, z = -255 + (Math.random() - 0.5) * 16; g.fx.explosion(x, 12 + Math.random() * 10, z, 0.6); g.audio.thunder(0.35); }
      },
      steps: () => [
        place(0, -236, PI),
        act((g, m) => gang(g, m, [[-12, -250], [12, -252], [-20, -258], [20, -258], [0, -262]], { group: 'fw', weapon: 'smg' })),
        killGroup('fw', 'Take down Rana\'s men on the beach'),
        act((g, m) => boss(g, m, 'INSPECTOR RANA', 0, -262, { model: 'police', weapon: 'rifle', health: 950, damage: 1.2 })),
        say([['RANA', 'Vikram! Every story needs a villain. Tonight, I am yours!']]),
        bossFight('boss', 'Take down INSPECTOR RANA'),
        act((g) => { g.slowmo(1.6, 0.25); g.hud.showBig('RANA IS FINISHED. FOR REAL.', '#ffc531', 3); g.rewards.event('RANA DEFEATED', 3000, 200); }),
      ],
    },

    // ===================== CHAPTER 8: KING OF NAVAPUR =====================
    {
      id: 67, title: 'The Plan', atmo: 'day',
      brief: 'The big one: Navapur Central Bank. Photograph the four ways in - front door, side door, roof ladder and the guard post - without the guards noticing you.',
      reward: 4000, par: [120, 200], next: 'Every heist needs wheels.',
      intro: [{ at: [-68.5, -37], yaw: PI / 2, act: 'talk', cam: 'front', where: 'Ravi\'s garage · 9:00 AM', with: [{ rig: 'ravi', f: 1.6, act: 'listen' }, { rig: 'm_red', f: 1.4, r: 1.2, act: 'listen' }],
        text: 'Vikram drew a big square on the wall: "Navapur Central Bank. Gold for a hundred years. One job, and we never steal again."' }],
      steps: () => [
        place(-37.5, -2, PI),
        act((g, m) => { K.guards(g, m, [[-45, -26, 0], [-28, -26, 0, [[-28, -26], [-28, -36]]]], null, { group: 'bk', model: 'police' }); }),
        K.photo(() => [{ x: -37.5, y: 2, z: -24 }, { x: -50.5, y: 2, z: -37.5 }, { x: -24.5, y: 3, z: -45 }, { x: -45, y: 1.6, z: -24 }], 'Photograph the bank\'s ways in', { range: 50 }),
        say([['RAVI (phone)', 'The side door has no camera. That\'s our way.']]),
      ],
      onAlert: (g, m) => { if (!m.vars.al) { m.vars.al = true; g.dispatch.setStars(2); } },
    },
    {
      id: 68, title: 'Wheels for the Job', atmo: 'day',
      brief: 'Steal a fast getaway car and a van for the crew, and bring both to Ravi\'s garage.',
      reward: 3800, par: [180, 280], next: 'The bank manager\'s key card...',
      intro: [{ at: [-73, -30], yaw: 0, act: 'look', cam: 'front', where: 'Ravi\'s garage · 8:00 AM', text: 'Sunny made a list: "Fast car for the getaway. Van for the gold. Nothing flashy... OK, a bit flashy."' }],
      steps: () => [
        place(-70, -30, 0),
        K.stealList([
          { name: 'getaway sports car', type: 'sports', color: 0x1d1e22, at: [-118, -81.3], yaw: PI / 2 },
          { name: 'crew van', type: 'van', color: 0xc9ccd1, at: [-156.3, -40], yaw: 0 },
        ], [H.GARAGE.x, H.GARAGE.z], 'Steal the heist vehicles', { minHealth: 50, toName: 'Ravi\'s garage', pay: 500 }),
        say([['SUNNY', 'Now THAT is a getaway car!']]),
      ],
    },
    {
      id: 69, title: 'Key Card', atmo: 'day',
      brief: 'The bank manager drinks coffee on the promenade. He is careful: he turns round often. Pickpocket his key card from behind.',
      reward: 3600, par: [90, 160], next: 'Tools: quiet or loud?',
      onEvent: (g, m, type, data) => K.countRobs(g, m, type, data),
      intro: [{ at: [30, -219], yaw: PI, act: 'drink', cam: 'side', where: 'Seafront · 8:30 AM', text: 'Mr. Pillai, bank manager: same cafe, same coffee, same paranoia, every morning for 22 years.' }],
      steps: () => [
        place(20, -228, PI),
        K.pickpocket([{ at: [40, -233], yaw: -PI / 2, rig: 'm_office', name: 'Mr. Pillai', job: 'Bank manager', cash: 300, alert: true, walk: [[40, -233], [70, -233]] }], 'Pickpocket the manager\'s key card (from behind!)', { failOnCaught: 'Pillai saw you. He will change the codes!' }),
        say([['RAVI (phone)', 'Key card cloned! Put it back in his pocket... just kidding.']]),
      ],
    },
    {
      id: 70, title: 'Tools of the Trade', atmo: 'night',
      brief: 'The drilling machine is at the construction yard (the old godown). Sneak in and take out the guards silently - or go in loud.',
      reward: 4000, par: [140, 240], next: 'Test your new crew.',
      intro: [{ at: [-68.5, -37], yaw: PI / 2, act: 'listen', cam: 'front', where: 'Ravi\'s garage · 11:00 PM', with: [{ rig: 'ravi', f: 1.5, act: 'talk' }],
        text: 'Ravi: "The vault door is 40 cm of steel. We need the big drill from the construction yard." Vikram checked his gun... and put it back.' }],
      steps: () => [
        place(-6.5, 25, -PI / 2),
        K.choose('How do you get the drill?', 'QUIET: sneak and take down the guards', 'LOUD: shoot your way in',
          () => [
            act((g, m) => { for (const [x, z, p] of [[-38, 34, [[-38, 34], [-38, 26]]], [-28, 30, [[-28, 30], [-28, 40]]], [-34, 42, [[-34, 42], [-44, 42]]]]) { m.track(g.spawnOfficer(x, z, 0, null, { gang: true, model: 'm_worker', weapon: 'pistol', patrol: p, group: 'cy' })); } m.vars.cyN = 3; }),
            killGroup('cy', 'Take down the guards silently (TAKEDOWN from behind)'),
          ],
          () => [
            act((g, m) => gang(g, m, [[-38, 34], [-28, 30], [-34, 42], [-26, 38], [-40, 28]], { group: 'cl', weapon: 'smg' })),
            killGroup('cl', 'Fight through the yard'),
          ]),
        hold(-33, 32, 2.2, 3, 'Load the drill', { label: 'LOADING DRILL' }),
        say([['RAVI', 'Drill loaded. Bank vault, here we come!']]),
      ],
      onAlert: (g, m) => { if (m.vars.choice === 'a' && !m.vars.al) { m.vars.al = true; g.hud.toast('THEY SAW YOU - kill them all!'); } },
    },
    {
      id: 71, title: 'Crew Trials', atmo: 'day',
      brief: 'Two new crew members must prove themselves: the gunman shows his aim at the mela gallery... and so must you. Hit 12 targets in 40 seconds.',
      reward: 3600, par: [60, 100], next: 'The police must be busy on heist day.',
      intro: [{ at: [-37.5, 172], yaw: 0, act: 'talk', cam: 'front', where: 'North Park · 3:00 PM', with: [{ rig: 'm_hoodie', f: 1.6, act: 'listen' }],
        text: '"Shooter" Salim had a reputation. He also had a rule: he only works with people who can shoot better than him.' }],
      steps: () => [
        place(-37.5, 176, 0),
        act((g, m) => { const s = new H.THREE.Mesh(new H.THREE.BoxGeometry(10, 3, 0.4), new H.THREE.MeshStandardMaterial({ color: 0x22468f })); s.position.set(-37.5, 1.5, 192); g.scene.add(s); m.track(s); }),
        K.targets([[-41, 2.2, 191.5, PI], [-37.5, 2.6, 191.5, PI], [-34, 2.2, 191.5, PI], [-39.5, 1.4, 191.5, PI], [-35.5, 1.4, 191.5, PI]], 12, 40, 'Out-shoot Salim'),
        say([['SALIM', 'Okay, okay. You shoot better than me. I am in!']]),
      ],
    },
    {
      id: 72, title: 'Distraction', atmo: 'day',
      brief: 'On heist day the police must be busy far away. Plant bombs on three empty cars in the west of the city, blow them up, then lose the police.',
      reward: 4200, par: [150, 240], next: 'HEIST DAY.',
      intro: [{ at: [-150, 6.5], yaw: PI / 2, act: 'crouch', cam: 'side', where: 'West road · 9:50 AM', text: 'Three old cars, bought for cash from three different villages. Nobody would miss them.' }],
      steps: () => [
        place(-150, 8, PI / 2),
        act((g, m) => { for (const [x, z] of [[-160, 2.25], [-187.5, 40], [-147.75, 75]]) { const c = g.spawnParkedCar('sedan', 0x6b6e73, x, z, 0); c.missionCar = true; m.track(c); } }),
        K.plant([[-160, 4.6], [-185, 40], [-145.4, 75]], 2, 'Plant bombs on the three cars'),
        goTo(-110, 40, 6, 'Get to a safe distance'),
        K.blowUp([[-160, 2.25], [-187.5, 40], [-147.75, 75]]),
        act((g) => g.dispatch.setStars(3)),
        loseCops('Lose the police (they will be busy here for hours)'),
      ],
    },
    {
      id: 73, title: 'Heist Day', atmo: 'day',
      brief: 'Navapur Central Bank. QUIET: dress as cleaners and crack the vault. LOUD: storm in and hold off the guards while the drill works. Grab the gold.',
      reward: 9000, par: [200, 320], next: 'Five stars. Get the gold to the docks.',
      intro: [{ at: [-37.5, -2], yaw: PI, act: 'look', cam: 'wide', where: 'Central Bank · 10:00 AM', text: 'Distraction: done. Key card: done. Drill: done. Vikram looked at the bank for a long time. "Let\'s go make history."' }],
      watch: (g, m, dt) => H.allyFight(g, m, g.ravi, dt),
      steps: () => [
        place(-37.5, -2, PI),
        K.choose('How do you rob the bank?', 'QUIET: cleaners + crack the vault', 'LOUD: storm in and drill',
          () => [
            K.disguise('m_worker', 'cleaner', 'CLEANER'),
            act((g, m) => { K.guards(g, m, [[-45, -26, 0], [-30, -26, 0], [-37.5, -50, PI]], 'cleaner', { group: 'bq', model: 'police' }); }),
            hold(-37.5, -40, 2.2, 8, 'Crack the vault (stay calm)', { label: 'CRACKING VAULT' }),
            K.undisguise(),
          ],
          () => [
            act((g, m) => { crew(g, m, -34, -6); gang(g, m, [[-45, -24], [-30, -24], [-37.5, -50], [-50, -40]], { group: 'bl', model: 'police', weapon: 'smg' }); }),
            killGroup('bl', 'Take out the bank guards'),
            hold(-37.5, -40, 3, 12, 'Defend the drill at the vault', { label: 'DRILLING' }),
          ]),
        collect('gold', [[-37.5, -42], [-35, -42], [-40, -42]], 'Grab the gold', { type: 'gold', car: false, cash: 1500, label: 'GOLD BAR' }),
        act((g) => { g.hud.showBig('THE GOLD IS YOURS', '#ffc531', 2.2); }),
      ],
      rate: (g, m) => (m.vars.choice === 'a' ? 3 : m.elapsed < 260 ? 3 : 2),
    },
    {
      id: 74, title: 'Five Star Getaway', atmo: 'day',
      brief: 'Every police car in Navapur is after the gold van. 5 stars, helicopter, roadblocks. Get the van to the docks.',
      reward: 6000, par: [120, 200], next: 'Sunny has a speedboat waiting... but for whom?',
      intro: [{ at: [-37.5, -2], yaw: PI / 2, act: 'look', cam: 'back', where: 'Central Bank · 10:42 AM', text: 'The alarm screamed across the city. The van was heavy with gold, and Vikram could already hear the helicopter.' }],
      steps: () => [
        act((g, m) => { const v = parkedCar(g, m, 'van', 0xc9ccd1, -40, -2.25, PI / 2, 'van'); v.health = 300; v.maxHealth = 300; g.placePlayer(-40, 1, PI / 2); g.driving.enter(v); g.camera3p.snapBehind(); g.dispatch.setStars(5); }),
        K.deliver('van', PL.docks[0], -225, 9, 'Get the gold van to the docks (seafront east)', {}),
        act((g) => { g.dispatch.clear(false); g.hud.showBig('AT THE DOCKS!', '#ffc531', 1.6); }),
      ],
    },
    {
      id: 75, title: 'Betrayal', atmo: 'storm',
      brief: 'Sunny took the gold and the speedboat. Take the second boat and chase him across the stormy sea. Wreck his boat.',
      reward: 6000, par: [100, 180], next: 'The man behind everything: the Commissioner.',
      intro: [{ at: [150, -236], yaw: PI, act: 'look', cam: 'front', where: 'Docks · 11:05 AM', text: 'The boat was gone. So was the gold. So was Sunny. On the jetty, a note: "Sorry bhai. The Commissioner pays better."' }],
      steps: () => [
        act((g, m) => {
          const b = parkedCar(g, m, 'boat', 0xf4f4f4, 150, -284, -PI / 2, 'boat'); g.placePlayer(150, -281, -PI / 2); g.driving.enter(b); g.camera3p.snapBehind();
          const s = parkedCar(g, m, 'boat', 0xd62828, 110, -288, -PI / 2, 'sunny'); s.health = 220; s.maxHealth = 220; m.vars.sunny = s;
          s.boatRun = 0;
        }),
        {
          start: (g, m) => { m.objective('Chase Sunny\'s boat and wreck it (ram / shoot)'); m.music = 3; },
          update: (g, m, dt) => {
            const s = m.vars.sunny;
            if (s.exploded || s.health <= 0) return true;
            // Sunny zig-zags west along the coast.
            s.boatRun += dt;
            s.yaw = -PI / 2 + Math.sin(s.boatRun * 0.6) * 0.35;
            const sp = 13;
            s.x += Math.sin(s.yaw) * sp * dt; s.z = Math.max(-300, Math.min(-282, s.z + Math.cos(s.yaw) * sp * dt));
            if (s.x < -230) s.x = 230;
            s.y = (g.atmo.floodLevel ?? -0.55) - 0.2; s.syncMesh();
            m.marker(s.x, s.z, 4, true);
            g.hud.setBoss('SUNNY\'S BOAT', Math.max(0, s.health) / 220);
            if (Math.hypot(g.player.x - s.x, g.player.z - s.z) > 200) { m.fail('Sunny got away with the gold'); return false; }
            return false;
          },
          end: (g, m) => { g.hud.setBoss(null); m.marker(null); m.music = 1; },
        },
        act((g) => { g.slowmo(1.4, 0.3); g.hud.showBig('GOLD RECOVERED', '#ffc531', 2.2); g.rewards.event('SUNNY STOPPED', 2000, 120); }),
        say([['SUNNY (swimming)', 'Bhai! I am sorry! The Commissioner... he has my family! He\'s at the seafront!']]),
      ],
    },
    {
      id: 76, title: 'King of Navapur', atmo: 'night', chapterEnd: 8,
      brief: 'The Commissioner - the man who owned Rana, Neta, Kapoor and Babu - waits on Marine Drive with his task force. End it. Become the King of Navapur.',
      reward: 15000, par: [240, 400], next: 'THE END... for now. Sagarpet is waiting.',
      intro: [{ at: [0, -229], yaw: PI, act: 'look', cam: 'wide', where: 'Marine Drive · Midnight', text: 'Every story in Navapur led to one man. Vikram walked onto Marine Drive alone. The city held its breath.' }],
      watch: (g, m, dt) => H.allyFight(g, m, g.ravi, dt),
      steps: () => [
        place(0, -229, PI / 2),
        act((g, m) => { crew(g, m, -3, -230); }),
        say([['RAVI', 'Not alone, bhai. Never alone.']]),
        K.waves([{ at: [[30, -226], [36, -222], [40, -230]], weapon: 'smg' }, { at: [[-30, -226], [-36, -222], [-40, -230], [-34, -234]], weapon: 'smg' }, { at: [[30, -234], [-30, -234], [36, -222], [-36, -222]], weapon: 'rifle' }],
          'Fight the task force', (g, m, x, z, o) => spawnThug(g, m, x, z, { ...o, model: 'swat' })),
        act((g, m) => boss(g, m, 'THE COMMISSIONER', 20, -236, { model: 'police', weapon: 'rifle', health: 1300, damage: 1.25 })),
        say([['THE COMMISSIONER', 'You are just a thief, Vikram. I AM the law in Navapur.'], ['VIKRAM', 'Then the law is about to change.']]),
        bossFight('boss', 'Take down THE COMMISSIONER'),
        act((g) => { g.slowmo(2, 0.25); g.hud.showBig('KING OF NAVAPUR', '#ffc531', 4); g.rewards.event('KING OF NAVAPUR', 5000, 400); }),
        say([['RAVI', 'It\'s over, bhai. Navapur is free.'], ['VIKRAM', 'Free? Ha. I hear Sagarpet has a lot of gold...']], true),
      ],
    },
  ];
  return M;
}

const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pick2 = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- "EARLIER..." flashbacks for missions 1-26 ----------
export const INTROS = {
  1: [{ at: [19, -14], yaw: PI, act: 'look', cam: 'front', where: 'Gold Exchange · 9:58 PM', text: 'Ten minutes earlier: the plan was perfect. Vikram had watched the jewellery shop for three weeks.' },
    { at: [8, 19.5], yaw: -PI / 2, act: 'crouch', cam: 'side', where: '10:04 PM', text: 'Then the alarm went off. A camera nobody knew about had his face.' }],
  2: [{ at: [6, 29], yaw: PI / 2, act: 'phone', cam: 'front', where: 'Raju Tea Stall · 11:00 PM', text: 'Hiding behind the chai stall, Vikram called the one man who could help: Ravi.' }],
  3: [{ at: [-66, -28], yaw: 0, act: 'phone', cam: 'front', where: 'Downtown · Midnight', text: 'Ravi sent a pin: "Old warehouse. Come alone. Come quietly."' }],
  4: [{ at: [-36, 34], yaw: 0, act: 'talk', cam: 'front', where: 'Old warehouse · 12:30 AM', with: [{ rig: 'ravi', f: 1.5, act: 'listen' }], text: 'Ravi gave Vikram a gun. "Somebody sold you to the police, bhai. Watch your back."' }],
  5: [{ at: [-35, 30], yaw: PI, act: 'look', cam: 'front', where: 'Old warehouse · 1:00 AM', text: 'Blue lights flashed through the windows. They had been followed.' }],
  6: [{ at: [190, -219], yaw: -PI / 2, act: 'talk', cam: 'front', where: 'Marine Drive · 11:00 PM', with: [{ rig: 'm_red', f: 1.5, act: 'talk' }], text: 'Sunny, Ravi\'s cousin, races for money on Marine Drive. "One race, bhai. You need the cash."' }],
  7: [{ at: [-182, -70], yaw: PI, act: 'phone', cam: 'side', where: 'West Bazaar · 4:00 PM', text: 'Sunny\'s friends had a name: Pappu. Pappu had sold Vikram to the police for ₹5,000.' }],
  8: [{ at: [6, 29], yaw: PI / 2, act: 'drink', cam: 'front', where: 'Raju Tea Stall · 10:00 AM', text: 'Pappu talked. Kaali, the bazaar don, wanted Vikram\'s money. Vikram decided to take Kaali\'s instead.' }],
  9: [{ at: [104, -219], yaw: -PI / 2, act: 'look', cam: 'front', where: 'Seafront · 6:00 PM', text: 'Kaali\'s van was full of explosives. The plan: park it at the bazaar. Vikram had other plans.' }],
  10: [{ at: [6, 22], yaw: -PI / 2, act: 'phone', cam: 'front', where: 'Start block · 3:00 PM', text: 'Ravi called, screaming: "They took Sonu, my little brother!"' }],
  11: [{ at: [15, -6], yaw: PI, act: 'look', cam: 'front', where: 'Gold Exchange · 9:00 AM', text: 'Chapter two. A new target: the gold of Navapur. And the man guarding it: Inspector Rana.' }],
  12: [{ at: [-36, 34], yaw: 0, act: 'listen', cam: 'front', where: 'Old warehouse · 8:00 PM', with: [{ rig: 'ravi', f: 1.5, act: 'talk' }], text: 'Kaali\'s last men wanted revenge. Ravi counted the bullets: not enough. "Shoot straight, bhai."' }],
  13: [{ at: [190, -219], yaw: -PI / 2, act: 'cheer', cam: 'front', where: 'Marine Drive · 2:00 AM', text: 'Sunny wanted a drifting video for his channel. Vikram wanted Sunny\'s prize money.' }],
  14: [{ at: [-20, 20], yaw: -PI / 2, act: 'talk', cam: 'front', where: 'Ravi\'s garage · 9:00 AM', with: [{ rig: 'ravi', f: 1.5, act: 'listen' }], text: 'The heist crew needed a getaway driver. They had heard about the man who escapes everything.' }],
  15: [{ at: [15, -4], yaw: PI, act: 'wait', cam: 'side', where: 'Gold Exchange · 2:58 PM', text: 'Engine running. Two minutes, Ravi had said. Two minutes can be very long.' }],
  16: [{ at: [-112, 30], yaw: 0, act: 'look', cam: 'front', where: 'West Park · 5:00 PM', text: 'Sunny\'s package had to cross the city fast. The park ramps were the fastest way - and the craziest.' }],
  17: [{ at: [-36, 34], yaw: 0, act: 'crouch', cam: 'side', where: 'Old warehouse · 11:00 PM', text: 'Kaali\'s old warehouse was full of guards and secrets. Vikram learned to move like a shadow.' }],
  18: [{ at: [104, -100], yaw: PI, act: 'phone', cam: 'front', where: 'East Bazaar · 7:00 PM', text: 'An unknown number: "Rana has planted bombs to frame you. Find them before 8."' }],
  19: [{ at: [-37.5, -2], yaw: PI, act: 'look', cam: 'wide', where: 'Marine Palace · 1:00 AM', text: 'The Marine Palace vault. Every rich family in Navapur keeps their gold here. Tonight, Vikram does too.' }],
  20: [{ at: [-36, -15], yaw: PI, act: 'look', cam: 'front', where: 'Downtown · Dawn', text: 'Rana wanted his gold back. And this time, he was not bringing the law - just his guns.' }],
  21: [{ at: [-6, -219], yaw: -PI / 2, act: 'talk', cam: 'front', where: 'Seafront · 9:00 PM', with: [{ rig: 'm_red', f: 1.5, act: 'phone' }], text: 'Sunny set up his phone on the dashboard. "Bhai, the whole of India will watch tonight. Ready?"' }],
  22: [{ at: [30, 100], yaw: 0, act: 'cheer', cam: 'front', where: 'North Bazaar · 10:00 AM', text: 'Holi morning. Rana was showing off a golden pichkari on stage - stolen from a temple, everyone said.' }],
  23: [{ at: [37.5, -72], yaw: 0, act: 'look', cam: 'front', where: 'Downtown plaza · 11:59 PM', text: 'The clock struck midnight... and then struck midnight again. Something was very wrong with time.' }],
  24: [{ at: [8, 46], yaw: 0, act: 'crouch', cam: 'side', where: 'Start block · 9:00 PM', text: 'Click. The whole city went dark. Then, in the distance - torches. Rana\'s hunters.' }],
  25: [{ at: [2, -219], yaw: -PI / 2, act: 'phone', cam: 'front', where: 'Seafront · 3:00 PM', text: 'Three days of rain. The sea came into the city. Ravi\'s call was mostly water noises: "Help... car roof... bazaar!"' }],
  26: [{ at: [68, 6.5], yaw: -PI / 2, act: 'look', cam: 'front', where: 'East road · 8:00 PM', text: 'Police checkpoints on every road. But nobody stops a baraat in Navapur. Nobody.' }],
};
