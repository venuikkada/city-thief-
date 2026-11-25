// Rewards that keep you coming back: cash pop-ups, kill combos, street RANK with unlocks,
// a SHOP to spend your cash, and a DAILY reward that grows every day you play.
import { writeSave } from './missions.js';

export const RANKS = [
  { xp: 0, name: 'STREET KID' },
  { xp: 250, name: 'PICKPOCKET', perk: '+20 max health' },
  { xp: 700, name: 'CAR THIEF', perk: 'SHOTGUN in the shop' },
  { xp: 1400, name: 'HUSTLER', perk: 'Reload 25% faster' },
  { xp: 2400, name: 'GANGSTER', perk: 'RIFLE in the shop' },
  { xp: 3800, name: 'ENFORCER', perk: '+20 max health' },
  { xp: 5600, name: 'BOSS', perk: 'GOLDEN PISTOL in the shop' },
  { xp: 8000, name: 'DON OF NAVAPUR', perk: 'Police give up faster' },
];

export const DAILY = [500, 750, 1000, 1500, 2000, 3000, 5000];

export const SHOP = [
  { id: 'armour', name: 'BODY ARMOUR', desc: 'Start every mission with armour (+60)', price: 1500, rank: 0, icon: '🦺' },
  { id: 'nitro', name: 'NITRO TANK', desc: 'Nitro lasts twice as long', price: 2000, rank: 0, icon: '⚡' },
  { id: 'mags', name: 'BIG MAGAZINES', desc: '+50% bullets in every gun', price: 2500, rank: 1, icon: '🔫' },
  { id: 'shotgun', name: 'SHOTGUN', desc: 'Huge power up close', price: 3000, rank: 2, icon: '💥', weapon: true },
  { id: 'rifle', name: 'RIFLE', desc: 'Long range, fast fire', price: 6000, rank: 4, icon: '🎯', weapon: true },
  { id: 'gold', name: 'GOLDEN PISTOL', desc: 'Double damage. Pure style.', price: 15000, rank: 6, icon: '👑', weapon: true },
];

const COMBO_NAMES = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'RAMPAGE!', 'UNSTOPPABLE!'];

export class Rewards {
  constructor(game) {
    this.game = game;
    this.combo = 0; this.comboT = 0; this.nearCombo = 0; this.nearT = 0; this.saveT = 0;
    const s = game.save;
    s.xp = s.xp || 0; s.items = s.items || []; s.weapons = s.weapons || []; s.daily = s.daily || { last: '', streak: 0 };
    s.best = s.best || {};
  }

  get save() { return this.game.save; }
  get rank() { return rankOf(this.save.xp); }
  has(id) { return this.save.items.includes(id); }

  // Shown on screen + added to your wallet.
  addCash(n, label, kind = 'cash') {
    const g = this.game;
    n = Math.round(n);
    this.save.coins += n;
    if (g.mission) g.mission.cashEarned = (g.mission.cashEarned || 0) + n;
    g.hud.popup(label ? `${label}  +₹${n.toLocaleString('en-IN')}` : `+₹${n.toLocaleString('en-IN')}`, kind);
    g.music.cash();
    this.dirty = true;
  }

  addXP(n) {
    const before = this.rank;
    this.save.xp += Math.round(n);
    const after = this.rank;
    if (after > before) { this.game.onRankUp(after, RANKS[after]); this.game.applyPerks(); }
    this.dirty = true;
  }

  // An enemy went down: cash + XP, more for headshots and quick chains.
  kill(target, head) {
    const g = this.game;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 3.5;
    const base = target.isOfficer ? (target.boss ? 2000 : target.swat ? 150 : target.gang ? 120 : 100) : 0;
    if (!base) return;   // no reward for hurting ordinary people
    const mult = Math.min(this.combo, 6);
    let label = head ? 'HEADSHOT' : target.boss ? `${target.bossName || 'BOSS'} DOWN` : '';
    if (this.combo >= 2) label = COMBO_NAMES[Math.min(this.combo, 6)];
    this.addCash(base * (1 + (mult - 1) * 0.5) + (head ? 50 : 0), label, this.combo >= 2 || head ? 'combo' : 'cash');
    this.addXP(target.boss ? 150 : 10 + (head ? 5 : 0) + (this.combo >= 2 ? 5 : 0));
    if (this.combo >= 3 || target.boss) g.slowmo(0.7, 0.35);
    if (g.mission) { g.mission.stats.kills++; if (head) g.mission.stats.heads++; }
  }

  nearMiss() {
    this.nearCombo = this.nearT > 0 ? this.nearCombo + 1 : 1;
    this.nearT = 4;
    const n = this.nearCombo;
    this.addCash(20 * Math.min(n, 5), n > 1 ? `NEAR MISS x${n}` : 'NEAR MISS', 'bonus');
    this.addXP(2);
  }

  drift(points) {
    const cash = Math.round(points / 9);
    if (cash < 5) return;
    this.addCash(cash, `DRIFT ${Math.round(points).toLocaleString('en-IN')}`, 'bonus');
    this.addXP(Math.min(40, points / 100));
    if (this.game.mission) this.game.mission.stats.drift = (this.game.mission.stats.drift || 0) + points;
  }

  stunt(airTime, distance) {
    const g = this.game;
    const cash = Math.round(airTime * 220 + distance * 6);
    const label = airTime > 1.3 ? 'INSANE STUNT' : airTime > 0.9 ? 'GREAT STUNT' : 'STUNT JUMP';
    this.addCash(cash, `${label} ${distance.toFixed(0)}m`, 'combo');
    this.addXP(15 + airTime * 10);
    if (g.mission) g.mission.stats.stunts = (g.mission.stats.stunts || 0) + 1;
  }

  // Anything else worth a pat on the back.
  event(label, cash, xp = 10) { this.addCash(cash, label, 'bonus'); this.addXP(xp); }

  // ---- Daily reward: come back every day, it grows; miss a day and it starts again ----
  dailyAvailable() {
    const today = dayKey(new Date());
    const d = this.save.daily;
    if (d.last === today) return null;
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    const streak = d.last === yesterday ? d.streak + 1 : 1;
    return { day: streak, amount: DAILY[Math.min(streak, DAILY.length) - 1] };
  }
  claimDaily() {
    const r = this.dailyAvailable();
    if (!r) return null;
    this.save.daily = { last: dayKey(new Date()), streak: r.day };
    this.save.coins += r.amount;
    writeSave(this.save);
    return r;
  }

  // ---- Shop ----
  canBuy(item) { return !this.has(item.id) && this.save.coins >= item.price && this.rank >= item.rank; }
  buy(id) {
    const item = SHOP.find((i) => i.id === id);
    if (!item || !this.canBuy(item)) return false;
    this.save.coins -= item.price;
    this.save.items.push(id);
    if (item.weapon && !this.save.weapons.includes(id)) this.save.weapons.push(id);
    writeSave(this.save);
    this.game.applyPerks();
    return true;
  }

  update(dt) {
    if (this.comboT > 0) this.comboT -= dt;
    if (this.nearT > 0) this.nearT -= dt;
    this.saveT -= dt;
    if (this.dirty && this.saveT <= 0) { this.saveT = 2; this.dirty = false; writeSave(this.save); }
  }
}

export function rankOf(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}

// XP needed: progress (0..1) inside the current rank.
export function rankProgress(xp) {
  const r = rankOf(xp);
  if (r >= RANKS.length - 1) return 1;
  return (xp - RANKS[r].xp) / (RANKS[r + 1].xp - RANKS[r].xp);
}

function dayKey(d) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
