// Voices: Vikram and the people of Navapur SPEAK (Indian English), using the text-to-speech
// voices already inside the phone or computer (free, works offline on most phones).
//   - Mission dialogue: every subtitle line is spoken in that character's voice.
//   - Objectives: Vikram says what to do next ("Okay, first I have to go to Ravi's garage").
//   - Reminders: stand around too long and Vikram reminds you what to do first.
//   - Meeting people: Vikram greets them, they answer in their own voice.
// In the Android app the phone's own TTS engine is used through a small bridge (window.AndroidTTS).
import { pick } from './util.js';

// Who sounds how. sex: m / f, pitch and rate tweak the same voice so characters sound different.
const CAST = {
  VIKRAM: { sex: 'm', pitch: 0.9, rate: 1.0 },
  RAVI: { sex: 'm', pitch: 1.12, rate: 1.06 },
  SUNNY: { sex: 'm', pitch: 1.22, rate: 1.12 },
  RANA: { sex: 'm', pitch: 0.72, rate: 0.95 },
  'INSPECTOR RANA': { sex: 'm', pitch: 0.72, rate: 0.95 },
  KAPOOR: { sex: 'm', pitch: 0.8, rate: 0.92 },
  'CHHOTA BABU': { sex: 'm', pitch: 1.3, rate: 1.15 },
  NETA: { sex: 'm', pitch: 0.78, rate: 0.9 },
  'THE COMMISSIONER': { sex: 'm', pitch: 0.68, rate: 0.9 },
  COMMISSIONER: { sex: 'm', pitch: 0.68, rate: 0.9 },
  PAPPU: { sex: 'm', pitch: 1.25, rate: 1.18 },
  SALIM: { sex: 'm', pitch: 0.95, rate: 1.05 },
  KAALI: { sex: 'm', pitch: 0.75, rate: 1.0 },
  POLICE: { sex: 'm', pitch: 0.85, rate: 1.12 },
  DADI: { sex: 'f', pitch: 1.05, rate: 0.9 },
  MEENA: { sex: 'f', pitch: 1.15, rate: 1.05 },
  'CAMP LADY': { sex: 'f', pitch: 1.1, rate: 1.0 },
  PRIYA: { sex: 'f', pitch: 1.15, rate: 1.05 },
  '': { sex: 'n', pitch: 1.0, rate: 0.98 },   // the narrator (flashbacks)
};
const FEMALE_WORDS = /\b(DADI|LADY|AUNTY|DIDI|MADAM|WOMAN|GIRL|MEENA|PRIYA|ASSISTANT|NURSE|BRIDE|MOTHER|MAA)\b/;
// Voice names that tell us male / female (Windows, Edge, Apple, Android).
const MALE_NAMES = /ravi|prabhat|rishi|hemant|madhur|kunal|aarav|arjun|male|en-in-x-end|en-in-x-cxx/i;
const FEMALE_NAMES = /heera|neerja|veena|lekha|kalpana|swara|aditi|raveena|female|en-in-x-ene|en-in-x-ahp/i;

const GREET_M = ['Namaste ji.', 'Bhai, one minute.', 'Excuse me, boss.', 'Hello uncle, how are you?', 'Arre bhai, suniye.', 'Sir ji, quick question.'];
const GREET_F = ['Namaste ji.', 'Didi, one minute.', 'Excuse me, madam.', 'Hello aunty, how are you?', 'Suniye ji, one question.'];
const SAY_OBJ = ['Okay. First, I have to {x}.', 'Right. Now I need to {x}.', 'Chalo, let me {x}.', 'Next, I must {x}.', 'Okay Vikram, {x}.'];
const SAY_REMIND = ['Arre, focus Vikram. I still have to {x}.', 'No time to waste. I need to {x}.', 'Ravi is counting on me. First I have to {x}.',
  'Chalo chalo, I have to {x}.', 'What am I doing? I must {x} first.'];

// "Drive to Ravi's garage (follow the yellow line)" -> "drive to Ravi's garage"
export function objectiveToSpeech(text) {
  let t = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/·.*$/, ' ').replace(/\b(Mr|Mrs|Dr|St)\./g, '$1');
  t = t.split(/[:!?.]|\s-\s/)[0].replace(/\s+/g, ' ').trim();
  if (!t || /^\d/.test(t)) return '';
  // ALL-CAPS words read badly: "WIN THE RACE" -> "win the race", "CHHOTA BABU" -> "Chhota Babu".
  if (t === t.toUpperCase()) t = t.toLowerCase();
  else t = t.replace(/\b([A-Z]{3,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
  return t[0].toLowerCase() + t.slice(1);
}
const keyOf = (text) => objectiveToSpeech(text).toLowerCase();

export class Voice {
  constructor(game, settings) {
    this.game = game;
    this.enabled = settings.voice !== false;
    this.native = typeof window !== 'undefined' && window.AndroidTTS ? window.AndroidTTS : null;
    this.web = !this.native && typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this.voices = { m: null, f: null, n: null, list: [] };
    this.busyUntil = 0; this.cur = null; this.id = 0; this.queue = [];
    this.lastObjKey = ''; this.pendingObj = null; this.objDelay = 0;
    this.idleT = 0; this.reminders = 0; this.lastSpokeObj = -99;
    if (this.web) {
      this.pickVoices();
      if (this.web.addEventListener) this.web.addEventListener('voiceschanged', () => this.pickVoices());
    }
    if (this.native) {
      window.__ttsDone = (id) => { if (this.cur && this.cur.id === Number(id)) this.done(); };
      try { const names = JSON.parse(this.native.voices() || '[]'); this.voices.list = names; } catch (e) { /* old app */ }
    }
  }

  get available() { return !!(this.native || (this.web && this.voices.list.length)); }

  // Best Indian English voices: en-IN first, then Hindi voices (they read English with an Indian
  // accent), then any English voice.
  pickVoices() {
    const all = this.web.getVoices() || [];
    const score = (v) => {
      const l = (v.lang || '').toLowerCase().replace('_', '-');
      let s = l === 'en-in' ? 100 : l.startsWith('hi') ? 60 : l === 'en-gb' ? 30 : l.startsWith('en') ? 20 : 0;
      if (/natural|online|neural|premium|enhanced/i.test(v.name)) s += 8;   // the nicer cloud voices (Edge, Apple)
      if (v.localService) s += 1;
      return s;
    };
    const ok = all.filter((v) => score(v) > 0).sort((a, b) => score(b) - score(a));
    this.voices.list = ok;
    const best = ok[0] || null;
    const of = (re) => ok.find((v) => re.test(v.name) && score(v) >= score(best) - 10) || null;
    this.voices.m = of(MALE_NAMES) || best;
    this.voices.f = of(FEMALE_NAMES) || best;
    this.voices.n = best;
  }

  castOf(who, sexHint) {
    const name = String(who || '').toUpperCase().replace(/\(.*?\)/g, '').trim();
    const c = CAST[name] || (name.includes('RAVI') ? CAST.RAVI : name.includes('RANA') ? CAST.RANA : name.includes('POLICE') || name.includes('CONSTABLE') || name.includes('OFFICER') ? CAST.POLICE : null);
    if (c) return c;
    const f = sexHint ? sexHint === 'f' : FEMALE_WORDS.test(name);
    // Everyone else: a voice that depends on the name, so the same person always sounds the same.
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return { sex: f ? 'f' : 'm', pitch: (f ? 1.1 : 0.88) + (h % 7) * 0.035, rate: 0.98 + (h % 5) * 0.03 };
  }

  // Speak one line. prio: 3 = story dialogue, 2 = Vikram's objective lines, 1 = small talk / shouts.
  say(who, text, o = {}) {
    if (!this.enabled || !text) return false;
    const prio = o.prio ?? 1, now = performance.now();
    if (this.cur && this.speaking && prio <= this.cur.prio) {
      // Busy: small talk waits its turn (a greeting, then the answer); old lines are dropped.
      if (o.queue && this.queue.length < 3) this.queue.push([who, text, { ...o, queue: false, at: now }]);
      return false;
    }
    if (prio >= 2) this.queue = [];
    const clean = String(text).replace(/[“”"]/g, '').replace(/₹\s?([\d,]+)/g, '$1 rupees').replace(/[^\p{L}\p{N}\s.,!?'%-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    const c = o.cast || this.castOf(who, o.sex);
    const rate = (c.rate || 1) * (o.rate || 1), pitch = c.pitch || 1;
    const id = ++this.id;
    // Safety: even if the speech engine never reports "done", the game goes on.
    const est = (0.75 + clean.length * 0.062 / rate) * 1000;
    this.cur = { id, prio, who };
    this.busyUntil = now + est;
    this.hardEnd = now + est * 2 + 2500;
    if (this.native) {
      try { this.native.speak(clean, pitch, rate, id, (c.sex || 'm') === 'f' ? 1 : 0); } catch (e) { this.done(); return false; }
      return true;
    }
    if (!this.web || !this.voices.list.length) { this.done(); return false; }
    try {
      this.web.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      const v = c.sex === 'f' ? this.voices.f : c.sex === 'n' ? this.voices.n : this.voices.m;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
      u.pitch = pitch; u.rate = rate; u.volume = this.game.settingsVolume ?? 1;
      u.onend = () => { if (this.cur && this.cur.id === id) this.done(); };
      u.onerror = () => { if (this.cur && this.cur.id === id) this.done(); };
      this.web.speak(u);
    } catch (e) { this.done(); return false; }
    return true;
  }

  done() { this.cur = null; this.busyUntil = 0; }

  // Is a line still being spoken? (subtitles wait for it)
  get speaking() {
    if (!this.cur) return false;
    const now = performance.now();
    if (now > this.hardEnd) { this.done(); return false; }
    if (this.web && !this.web.speaking && !this.web.pending && now > this.busyUntil - 200) { this.done(); return false; }
    return true;
  }

  stop() {
    this.cur = null; this.busyUntil = 0; this.pendingObj = null; this.queue = [];
    try { if (this.native) this.native.stop(); else if (this.web) this.web.cancel(); } catch (e) { /* ignore */ }
  }
  pause(on) { try { if (this.web) { if (on) this.web.pause(); else this.web.resume(); } else if (this.native && on) this.native.stop(); } catch (e) { /* ignore */ } }

  // ---------- Vikram talks about what to do ----------
  // The objective changed: say it (once per new goal, not for counters like "3 / 8").
  objective(text) {
    const k = keyOf(text);
    this.idleT = 0;   // the text changed (a counter went up): that is progress
    if (!k || k === this.lastObjKey) return;
    this.lastObjKey = k; this.pendingObj = text; this.objDelay = 0.9; this.idleT = 0; this.reminders = 0;
  }
  // Some progress happened (kills, pickups...): no reminder needed for a while.
  progress() { this.idleT = 0; }

  update(dt) {
    const g = this.game;
    if (!this.enabled || g.mode !== 'play') return;
    if (this.queue.length && !this.speaking) {
      const [who, text, o] = this.queue.shift();
      if (performance.now() - o.at < 6000) this.say(who, text, o);
    }
    const m = g.mission;
    if (this.pendingObj) {
      this.objDelay -= dt;
      if (this.objDelay <= 0 && !g.hud.subQueue.length && g.hud.subT <= 0 && !this.speaking) {
        const x = objectiveToSpeech(this.pendingObj);
        this.pendingObj = null;
        if (x && m && !m.done) { this.say('VIKRAM', pick(SAY_OBJ).replace('{x}', x), { prio: 2 }); this.lastSpokeObj = g.time; }
      }
      return;
    }
    // Reminder: nothing changed for a while (and he is not busy fighting or driving fast).
    if (!m || m.done || !m.objectiveText) { this.idleT = 0; return; }
    const P = g.player;
    const busy = g.dispatch.stars > 0 || g.hud.progressOn || (P.inCar && g.driving.speed > 6) || Math.hypot(P.vx || 0, P.vz || 0) > 3.5;
    this.idleT += busy ? dt * 0.35 : dt;
    if (this.idleT > 24 + this.reminders * 12 && this.reminders < 3 && !g.hud.subQueue.length && g.hud.subT <= 0 && !this.speaking) {
      const x = objectiveToSpeech(m.objectiveText);
      if (x) { this.say('VIKRAM', pick(SAY_REMIND).replace('{x}', x), { prio: 2 }); g.hud.toast(m.objectiveText); }
      this.idleT = 0; this.reminders++;
    }
  }

  // ---------- Meeting people ----------
  greet(person) {
    const f = person && person.rig && person.rig.sex === 'f';
    this.say('VIKRAM', pick(f ? GREET_F : GREET_M), { prio: 1 });
  }
  // A person answers (their voice depends on who they are).
  person(p, text, o = {}) {
    if (!p) return;
    const f = p.rig && p.rig.sex === 'f';
    const seed = Math.floor((p.seed ?? 0) % 997);
    const cast = { sex: f ? 'f' : 'm', pitch: (f ? 1.12 : 0.86) + (seed % 7) * 0.04, rate: 1.0 + (seed % 5) * 0.03 };
    this.say(p.profile?.name || 'PERSON', text, { prio: o.prio ?? 1, cast, queue: o.queue ?? true });
  }
}
