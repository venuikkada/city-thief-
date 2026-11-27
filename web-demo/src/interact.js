// Talking to the people of Navapur (and robbing them).
// Walk up to anyone and buttons appear:
//   TALK   - they stop, look at you and say something; a card shows who they are (name, job, a funny fact)
//   ROB    - pickpocket from behind: cash (sometimes a jackpot). From the front they see you: "CHOR! CHOR!"
//   PUSH   - shove them out of the way
//   HIRE   - pay Rs 500: they follow you and fight for you (2 at a time); they ride in your car
//   BUY    - at the chai stall / fruit cart: food heals you
// Aim a gun at someone: hands up, they drop their wallet.
// Witnesses of a crime phone the police (a red phone above their head) unless you stop them in time.
import * as THREE from 'three';
import { CharacterRig } from './characters.js';
import { AmbientPerson } from './ambient.js';
import { t as tr, tLabel } from './i18n.js';
import { dist, yawOf, pick } from './util.js';

const $ = (id) => document.getElementById(id);

// ---------- Who is this person? ----------
const MEN = ['Raju', 'Sanjay', 'Imran', 'Vinod', 'Arjun', 'Babloo', 'Deepak', 'Salim', 'Ganesh', 'Pappu', 'Rohit', 'Joseph', 'Harpreet', 'Kishore', 'Anil', 'Faisal', 'Murugan', 'Bunty'];
const WOMEN = ['Pinky', 'Sunita', 'Ayesha', 'Meena', 'Priya', 'Fatima', 'Lakshmi', 'Neha', 'Rekha', 'Anjali', 'Shabana', 'Kavya', 'Mary', 'Gurpreet', 'Divya'];
const SURN = ['Sharma', 'Patil', 'Khan', 'Iyer', 'Das', 'Yadav', 'Fernandes', 'Reddy', 'Singh', 'Gupta', 'Shaikh', 'Pillai', 'Joshi', 'Ghosh', 'Kulkarni', 'Nair'];
const JOBS = ['Software tester', 'Chai wala', 'Auto driver', 'College student', 'Wedding photographer', 'Bank clerk', 'Delivery partner',
  'Gym trainer', 'Tuition teacher', 'Mobile repair', 'Insurance agent', 'Street food vlogger', 'Nurse', 'Security guard',
  'Tailor', 'Cricket coach', 'Real estate broker', 'Call centre agent', 'Retired army man', 'Astrologer', 'YouTuber (412 subscribers)'];
const FACTS = ['Has seen every Bollywood blockbuster 4 times', 'Owes the chai wala Rs 340', 'Thinks the moon landing was shot in Navapur',
  'Lost 3 phones this year', 'Sings old film songs in the shower, very loudly', 'Has a pet parrot called Tiger', 'Wants to open a momo shop',
  'Failed the driving test 5 times', 'Believes cats bring bad luck', 'Saves every rupee in a steel almirah', 'Plays Ludo till 3 a.m.',
  'Is in 47 WhatsApp groups', 'Never misses a cricket match', 'Is scared of pigeons', 'Has a crush on the bank cashier',
  'Thinks he is the best driver in Navapur', 'Keeps Rs 2,000 in the left shoe', 'Sells old phones on the side', 'Knows every shortcut in the city'];
const HELLO = ['Haan bhai, bolo?', 'Kya chahiye?', 'Namaste ji!', 'Jaldi bolo, bus aa rahi hai.', 'Aap TV pe aaye the na?', 'Kuch kaam hai?',
  'Arre, rasta bhool gaye kya?', 'Mausam badiya hai na?', 'Main busy hoon bhai.', 'Selfie loge?', 'Hello hello!', 'Chai piyoge?'];
const TIPS = ['Suna hai bazaar mein police checking chal rahi hai.', 'Raat ko seafront pe bahut paisa wale log ghoomte hain.',
  'Gold Exchange ka guard 9 baje chai peene jaata hai.', 'Park mein jumping ramps hain, bike wale wahan stunt karte hain.',
  'Neeche wali gali mein Kaali ka gang ghoomta hai, bach ke!', 'Police wale peeche se aate hain, gali mein ghus jao.'];
const ROBBED = ['Arre! Mera wallet kahan gaya?!', 'Mera phone?! Abhi to yahin tha!', 'Haye! Paise gaye!'];
const CAUGHT = ['CHOR! CHOR!', 'Pakdo! Pakdo usko!', 'Bachao! Chor!'];
const PUSHED = ['Oye! Dhakka kyun diya?!', 'Andha hai kya?!', 'Tameez nahi hai kya?', 'Arre arre!'];
const THANKS = ['Bhagwan aapka bhala kare!', 'Dhanyavaad bhaiya!', 'Aap bahut ache ho!', 'Shukriya!'];
const HIRED = ['Chalo boss, main saath hoon!', 'Bolo kisko thokna hai!', 'Paisa bolta hai, boss!'];
const HANDS = ['Mat maaro! Sab le lo!', 'Bhai bhai, shant!', 'Ye lo, ye lo!'];

function hash(n) { const s = Math.sin(n * 91.345 + 3.21) * 43758.5453; return s - Math.floor(s); }
export function profileOf(p) {
  if (p.profile) return p.profile;
  const seed = (p.seed = p.seed ?? Math.random() * 1e6);
  const female = p.rig && p.rig.sex === 'f';
  const first = (female ? WOMEN : MEN)[Math.floor(hash(seed) * (female ? WOMEN : MEN).length)];
  p.profile = {
    name: `${first} ${SURN[Math.floor(hash(seed + 1) * SURN.length)]}`, age: 18 + Math.floor(hash(seed + 2) * 50),
    job: JOBS[Math.floor(hash(seed + 3) * JOBS.length)], fact: FACTS[Math.floor(hash(seed + 4) * FACTS.length)],
    cash: hash(seed + 5) < 0.06 ? 1500 + Math.floor(hash(seed + 6) * 3000) : 40 + Math.floor(hash(seed + 6) * 380),
  };
  if (p.shop) p.profile.job = p.shop.job;
  else if (p.vendor) p.profile.job = p.vendor === 'chai' ? 'Chai wala (best chai in Navapur)' : 'Fruit seller';
  return p.profile;
}

const _v = new THREE.Vector3();

export class Interact {
  constructor(game) {
    this.game = game;
    this.target = null; this.followers = []; this.callers = []; this.bubbles = [];
    this.bar = $('interact'); this.card = $('profile');
    this.cardT = 0; this.cooldown = 0;
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div'); el.className = 'bubble hidden';
      $('bubbles').appendChild(el);
      this.bubbles.push({ el, who: null, t: 0 });
    }
    $('profile-give').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.give(this.cardWho); });
  }

  // Short line of speech above someone's head.
  // A line from the list `key` in the player's language (English mode: the Hinglish line `en`).
  line(key, en) { const v = this.game.voice; return v ? v.line(key, en) : { text: pick(Array.isArray(en) ? en : [en]), lang: 'en' }; }
  sayL(p, key, en, kind = '') { const L = this.line(key, en); this.speak(p, L.text, kind, L); return L; }
  // L: a line from line() - spoken only when it is in the player's language.
  speak(p, text, kind = '', L = null) {
    if (!p) return;
    if (this.game.voice) this.game.voice.person(p, text, L ? { lang: L.lang, en: L.en } : {});   // said out loud in their own voice
    let b = this.bubbles.find((x) => x.who === p) || this.bubbles.find((x) => !x.who) || this.bubbles.reduce((a, x) => (x.t < a.t ? x : a));
    b.who = p; b.t = 2.6; b.el.textContent = text; b.el.className = 'bubble ' + kind;
  }

  candidates() {
    const g = this.game;
    return [...g.peds, ...g.ambient].filter((p) => !p.dead && !p.removed && !p.inactive && !p.noInteract && !p.follower && p.mesh && p.mesh.visible !== false);
  }

  update(dt, input) {
    const g = this.game, P = g.player;
    this.cooldown -= dt;
    // Pick who we are facing (close, in front).
    let best = null, bestD = 2.4;
    if (!P.inCar && !P.dead && g.mode === 'play') {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      for (const p of this.candidates()) {
        const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
        if (d > bestD || d < 0.01) continue;
        if ((dx * fx + dz * fz) / d < 0.25) continue;
        best = p; bestD = d;
      }
    }
    if (best !== this.target) {
      this.target = best;
      this.bar.classList.toggle('hidden', !best);
      if (best) {
        // Shopkeepers: BUY what the shop sells, or ROB THE TILL.
        $('btn-rob').classList.toggle('hidden', !!best.vendor && !best.shop);
        $('btn-rob-label').textContent = tr(best.shop ? 'ROB TILL' : 'ROB');
        $('btn-buy').classList.toggle('hidden', !best.vendor || (!!best.shop && !best.shop.buy));
        $('btn-buy-label').textContent = tLabel(best.shop ? (best.shop.buy ? best.shop.buy.label : '') : best.vendor === 'chai' ? 'CHAI ₹20' : 'FRUIT ₹30');
        $('btn-buy-icon').textContent = best.shop ? best.shop.icon || '🛒' : best.vendor === 'chai' ? '☕' : '🍎';
        $('btn-hire').classList.toggle('hidden', !!best.vendor || this.followers.length >= 2 || !!best.isOfficer);
      }
    }
    if (best && this.cooldown <= 0) {
      if (input.talkPressed) this.talk(best);
      else if (input.buyPressed && best.vendor) this.buy(best);
      else if (input.robPressed && best.shop) { this.cooldown = 1; g.interiors.robTill(best); }
      else if (input.robPressed && !best.vendor) this.rob(best);
      else if (input.robPressed && best.vendor) this.buy(best);
      else if (input.pushPressed) this.push(best);
      else if (input.hirePressed) this.hire(best);
    }
    // Hands up when you aim a gun at someone close (they are in the middle of the screen).
    if (!P.inCar && P.aiming && !P.dead) {
      g.camera.getWorldDirection(_v);
      const fl = Math.hypot(_v.x, _v.z) || 1, fx = _v.x / fl, fz = _v.z / fl;
      for (const p of this.candidates()) {
        if (p.handsUp || (p.vendor && !p.shop) || (p.shop && p.robbedBy)) continue;
        const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
        if (d > 12 || d < 0.5) continue;
        if ((dx * fx + dz * fz) / d > 0.97) { this.handsUp(p); break; }
      }
    }
    this.updateBubbles(dt);
    this.updateCallers(dt);
    this.updateFollowers(dt);
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.card.classList.add('hidden'); }
  }

  hold(p, t, gesture) {
    const P = this.game.player;
    p.holdT = t; p.holdGesture = gesture; p.faceX = P.x; p.faceZ = P.z;
  }

  talk(p) {
    const g = this.game;
    this.cooldown = 0.4;
    const pr = profileOf(p);
    this.hold(p, 3.5, 'talk');
    let L = this.line('greetBack', HELLO);
    const story = p.missionTalk ? p.missionTalk(g, p) : null;
    if (story) L = { text: story, lang: 'en' };   // mission talk: the story's own words (spoken in English mode only)
    else if (p.shop) L = p.robbedBy ? this.line('shopOut', ['Tum?! Nikal jao meri dukaan se!']) : this.line('welcome', [p.shop.hi]);
    else if (p.vendor) L = p.vendor === 'chai' ? this.line('chaiSell', ['Garam garam chai, sirf 20 rupaye!']) : this.line('fruitSell', ['Taaze phal, bhaiya! 30 rupaye.']);
    else if (hash(p.seed + 9) < 0.3) L = this.line('tips', TIPS);
    const line = L.text;
    this.cardWho = p;
    // Vikram speaks first, then they answer (in their own voice).
    if (g.voice) { g.voice.greet(p); g.voice.person(p, line, { lang: L.lang }); }
    $('profile-say').textContent = `“${line}”`;
    $('profile-name').textContent = `${pr.name}, ${pr.age}`;
    $('profile-job').textContent = pr.job;
    $('profile-fact').textContent = pr.fact;
    $('profile-give').classList.toggle('hidden', !!p.given);
    this.card.classList.remove('hidden'); this.cardT = 4.5;
    g.emit('talk', p);
  }

  rob(p) {
    const g = this.game, P = g.player;
    this.cooldown = 0.8;
    const pr = profileOf(p);
    if (p.robbed) { this.sayL(p, 'robbedAgain', ['Ab kuch nahi bacha bhai!']); return; }
    // Did they see me? (Facing me = yes; from behind = mostly no.)
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / d > 0.35;
    const seen = facing || Math.random() < 0.12 || p.alert;
    p.robbed = true;
    if (!seen) {
      const cash = pr.cash;
      g.rewards.addCash(cash, cash > 1000 ? 'JACKPOT WALLET' : 'PICKPOCKET', cash > 1000 ? 'combo' : 'cash');
      g.rewards.addXP(cash > 1000 ? 25 : 6);
      g.audio.click();
      p.robbedT = 3 + Math.random() * 4;   // they notice a bit later
      g.emit('rob', { person: p, ok: true, cash });
    } else {
      this.sayL(p, 'caught', CAUGHT, 'alarm');
      if (p.panicFrom) p.panicFrom(P.x, P.z);
      this.crimeSeen(p.x, p.z, 'rob', p);
      g.emit('rob', { person: p, ok: false });
    }
  }

  push(p) {
    const g = this.game, P = g.player;
    this.cooldown = 0.6;
    const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz) || 1;
    p.pushVX = (dx / d) * 4.2; p.pushVZ = (dz / d) * 4.2; p.pushT = 0.35;
    if (g.voice) g.voice.sayLine('VIKRAM', 'push', ['Hatt! Out of my way!', 'Side ho jao, bhai!', 'Move it!'], { queue: true });
    this.sayL(p, 'pushed', PUSHED, 'angry');
    g.audio.thump(0.4, 120, 0.12);
    if (p.panicFrom && Math.random() < 0.5) setTimeout(() => p.panicFrom(P.x, P.z), 400);
    else this.hold(p, 2, 'talk');
    if (p.calling) this.stopCaller(p);
    g.emit('push', p);
  }

  give(p) {
    const g = this.game;
    if (!p || p.given || g.save.coins < 100) { if (p && g.save.coins < 100) this.sayL(p, 'broke', ['Aapke paas bhi kuch nahi hai!']); return; }
    g.save.coins -= 100; p.given = true; p.alert = false;
    if (g.voice) g.voice.sayLine('VIKRAM', 'tip', ['Rakh lo ji, keep it.', 'Here, take this.', 'For you, uncle. Chai pe lena.'], { queue: true });
    this.sayL(p, 'thanks', THANKS, 'happy');
    g.rewards.addXP(3); g.hud.popup('-₹100  GOOD DEED', 'bonus');
    $('profile-give').classList.add('hidden');
    if (p.calling) this.stopCaller(p);
    g.emit('give', p);
  }

  buy(p) {
    const g = this.game, P = g.player;
    this.cooldown = 1;
    if (p.shop) { g.interiors.buy(p); return; }
    const price = p.vendor === 'chai' ? 20 : 30, heal = p.vendor === 'chai' ? 25 : 40;
    if (g.save.coins < price) { this.sayL(p, 'payFirst', ['Pehle paise lao!']); return; }
    g.save.coins -= price;
    if (g.voice) g.voice.sayLine('VIKRAM', p.vendor === 'chai' ? 'chai' : 'fruit', [p.vendor === 'chai' ? 'Bhaiya, ek cutting chai.' : 'Ek aam dena, bhaiya.'], { queue: true });
    P.health = Math.min(P.maxHealth || 100, P.health + heal);
    if (p.vendor === 'chai') this.sayL(p, 'chaiGive', ['Ek cutting chai, garam!'], 'happy'); else this.sayL(p, 'fruitGive', ['Taaza aam, khao aur jiyo!'], 'happy');
    g.hud.popup(`+${heal} HEALTH  -₹${price}`, 'bonus');
    if (P.rig) P.rig.setGesture('drink');
    setTimeout(() => P.rig && P.rig.setGesture(null), 1800);
    g.emit('buy', p);
  }

  hire(p) {
    const g = this.game, P = g.player;
    this.cooldown = 1;
    if (this.followers.length >= 2) return;
    if (g.save.coins < 500) { this.sayL(p, 'hireCost', ['500 rupaye do, phir baat karenge.']); return; }
    if (p.robbed || p.alert) { this.sayL(p, 'never', ['Tum? Kabhi nahi!']); return; }
    g.save.coins -= 500;
    if (g.voice) g.voice.sayLine('VIKRAM', 'hire', ['Five hundred rupees. You are with me now.', 'Chalo, join my crew.', 'I need a strong partner. Come.'], { queue: true });
    // The person becomes a crew member (a new body takes their place in the crowd).
    const f = new AmbientPerson(g, p.x, p.z, p.yaw, { rig: new CharacterRig(p.rig.id, { castShadow: g.shadows }), health: 160 });
    f.follower = true; f.calm = true; f.noInteract = true; f.profile = profileOf(p); f.walkSpeed = 1.6;
    g.ambient.push(f); this.followers.push(f);
    if (p.respawnElsewhere) p.respawnElsewhere(); else p.remove && p.remove();
    g.refreshLists();
    this.sayL(f, 'hired', HIRED, 'happy');
    g.hud.popup(`${f.profile.name.toUpperCase()} JOINED YOUR CREW  -₹500`, 'combo');
    this.target = null; this.bar.classList.add('hidden');
    g.emit('hire', f);
  }

  handsUp(p) {
    const g = this.game, P = g.player;
    if (p.shop) { g.interiors.robTill(p); return; }   // a gun at the shopkeeper: open the till
    p.handsUp = true;
    this.hold(p, 3, 'cheer');   // arms up
    this.sayL(p, 'hands', HANDS, 'alarm');
    if (!p.robbed) {
      p.robbed = true;
      const pr = profileOf(p);
      setTimeout(() => { if (!p.dead && g.pickups) g.pickups.spawn('cash', p.x + Math.sin(p.yaw) * 0.8, p.z + Math.cos(p.yaw) * 0.8, { value: pr.cash, auto: true }); }, 900);
    }
    setTimeout(() => { p.handsUp = false; if (p.panicFrom) p.panicFrom(P.x, P.z); }, 3200);
    this.crimeSeen(p.x, p.z, 'threat', p);
    g.emit('threaten', p);
  }

  // ---------- Witnesses ----------
  // Someone near who can see it takes out a phone. 5 seconds later: police (1 star), unless stopped.
  crimeSeen(x, z, kind, victim) {
    const g = this.game, P = g.player;
    if (g.dispatch.stars > 0 || this.callers.length) return;
    const near = this.candidates().filter((p) => p !== victim && !p.calling && dist(p.x, p.z, x, z) < 22 && !g.world.segmentBlocked(p.x, p.z, P.x, P.z));
    const w = victim && !victim.dead && Math.random() < 0.5 ? victim : near.sort(() => Math.random() - 0.5)[0];
    if (!w) return;
    w.calling = 5; w.alert = true;
    this.hold(w, 5.2, 'phone');
    this.callers.push(w);
    const Lc = this.line('callPolice', ['Hello police? Yahan ek chor hai!']); this.speak(w, '📞 ' + Lc.text, 'alarm', Lc);
    g.hud.toast('A WITNESS IS CALLING THE POLICE! Stop them!');
  }
  stopCaller(p) {
    p.calling = 0; this.callers = this.callers.filter((c) => c !== p);
    this.sayL(p, 'phoneOff', ['Theek hai, theek hai! Phone band!'], 'alarm');
    p.holdT = 0;
  }
  updateCallers(dt) {
    const g = this.game;
    for (const p of [...this.callers]) {
      if (p.dead || p.removed || p.inactive) { this.callers = this.callers.filter((c) => c !== p); continue; }
      p.calling -= dt;
      if (p.calling <= 0) {
        this.callers = this.callers.filter((c) => c !== p);
        if (g.dispatch.stars === 0) { g.dispatch.setStars(1); g.hud.toast('SOMEONE CALLED THE POLICE'); }
      }
    }
  }

  // ---------- Bubbles ----------
  updateBubbles(dt) {
    const g = this.game, cam = g.camera, W = innerWidth, H = innerHeight;
    for (const b of this.bubbles) {
      if (!b.who) continue;
      b.t -= dt;
      const p = b.who;
      if (b.t <= 0 || p.removed || (p.mesh && !p.mesh.parent)) { b.who = null; b.el.classList.add('hidden'); continue; }
      _v.set(p.x, (p.groundY ?? 0) + 2.1, p.z).project(cam);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && dist(p.x, p.z, cam.position.x, cam.position.z) < 45;
      b.el.classList.toggle('hidden', !vis);
      if (vis) b.el.style.transform = `translate(${((_v.x + 1) / 2) * W}px, ${((1 - _v.y) / 2) * H}px) translate(-50%, -100%)`;
    }
    // Robbed people notice a few seconds later.
    for (const p of this.game.peds) {
      if (p.robbedT > 0) { p.robbedT -= dt; if (p.robbedT <= 0) { this.sayL(p, 'robbed', ROBBED); p.holdT = 1.8; p.holdGesture = 'look'; } }
    }
  }

  // ---------- Crew ----------
  updateFollowers(dt) {
    const g = this.game, P = g.player;
    this.followers = this.followers.filter((f) => !f.removed && !(f.dead && (f.deadT = (f.deadT || 0) + dt) > 8 && (f.remove(), true)));
    this.followers.forEach((f, i) => {
      if (f.dead) return;
      const car = g.driving.car;
      if (P.inCar && car) {
        f.mesh.visible = false; f.x = car.x; f.z = car.z; f.inCar = true;
        return;
      }
      if (f.inCar) {   // hop out next to Vikram
        f.inCar = false; f.mesh.visible = true;
        const side = i === 0 ? 1 : -1;
        f.x = P.x + Math.cos(P.yaw) * 1.4 * side; f.z = P.z - Math.sin(P.yaw) * 1.4 * side;
      }
      // Walk / run behind Vikram.
      const side = i === 0 ? 1 : -1;
      const tx = P.x - Math.sin(P.yaw) * 2 + Math.cos(P.yaw) * 1.2 * side, tz = P.z - Math.cos(P.yaw) * 2 - Math.sin(P.yaw) * 1.2 * side;
      const d = dist(f.x, f.z, tx, tz);
      if (d > 30) { f.x = tx; f.z = tz; }
      f.walkSpeed = d > 6 ? 5.2 : d > 2.5 ? 3.4 : 1.6;
      f.walkTo = d > 1.2 ? { x: tx, z: tz } : null;
      if (!f.walkTo) f.faceTarget = { x: P.x + Math.sin(P.yaw) * 10, z: P.z + Math.cos(P.yaw) * 10 };
      this.followerFight(f, dt);
    });
  }
  followerFight(f, dt) {
    const g = this.game;
    f.fireT = (f.fireT ?? 1.2) - dt;
    if (f.fireT > 0) return;
    f.fireT = 1.0 + Math.random() * 0.8;
    let best = null, bd = 28;
    for (const o of g.officers) {
      if (o.dead || o.inactive) continue;
      const hostile = o.gang || o.forceHostile || (g.dispatch.stars >= 2 && !o.guard);
      if (!hostile || (o.guard && !o.guard.alerted)) continue;
      const d = dist(f.x, f.z, o.x, o.z);
      if (d < bd && !g.world.segmentBlocked(f.x, f.z, o.x, o.z)) { bd = d; best = o; }
    }
    if (!best) return;
    f.faceTarget = best;
    const from = new THREE.Vector3(f.x, f.groundY + 1.45, f.z), to = new THREE.Vector3(best.x, best.groundY + 1.2, best.z);
    g.fx.muzzle(from.clone().lerp(to, 0.03)); g.fx.tracer(from, to, 0.7);
    g.audio.gunshot('pistol', 0.5);
    if (Math.random() < 0.35) best.takeDamage(28, true, f.x, f.z);
  }

  reset() {
    for (const f of this.followers) f.remove();
    this.followers = []; this.callers = []; this.target = null;
    this.bar.classList.add('hidden'); this.card.classList.add('hidden');
    for (const b of this.bubbles) { b.who = null; b.el.classList.add('hidden'); }
  }
}
