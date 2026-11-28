"""Build the game's sound files from CC0 freesound recordings: trim, clean, level, slice footsteps,
make seamless loops, encode small MP3s, write the manifest + credits."""
import json, os, sys, shutil
sys.path.insert(0, 'tools')
import numpy as np
from au import load, trim, fade, norm_peak, norm_rms, envelope, db, save_mp3, SR, mono

OUT = 'out'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
meta = json.load(open('picked.json'))['meta']
MAN = {}      # name -> {files: [...], loop: [a, b] (seconds) or None}
USED = {}     # freesound id -> list of names (credits)

def src(i, ch=1): return load(f'raw/{i}.mp3', ch)
def hpf(a, fc=40):
    # 2nd-order high-pass (biquad, RBJ) to remove rumble / DC
    w = 2 * np.pi * fc / SR; c = np.cos(w); s = np.sin(w); al = s / (2 * 0.707)
    b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2; a0, a1, a2 = 1 + al, -2 * c, 1 - al
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    x = a if a.ndim == 1 else a
    def run(v):
        y = np.zeros_like(v); x1 = x2 = y1 = y2 = 0.0
        for n in range(len(v)):
            yn = b0 * v[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, v[n], y1, yn; y[n] = yn
        return y
    return run(x) if x.ndim == 1 else np.stack([run(x[:, k]) for k in range(x.shape[1])], axis=1)
def lpf(a, fc):
    w = 2 * np.pi * fc / SR; c = np.cos(w); s = np.sin(w); al = s / (2 * 0.707)
    b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2; a0, a1, a2 = 1 + al, -2 * c, 1 - al
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    from scipy.signal import lfilter
    return lfilter([b0, b1, b2], [1, a1, a2], a, axis=0).astype('float32')
def hpf2(a, fc=40):
    from scipy.signal import butter, sosfilt
    sos = butter(2, fc, 'highpass', fs=SR, output='sos'); return sosfilt(sos, a, axis=0).astype('float32')

def put(name, a, i, kbps=96, sr=44100, idx=None):
    fn = f'{name}{"" if idx is None else "_" + str(idx)}.mp3'
    size = save_mp3(a, f'{OUT}/{fn}', kbps, sr)
    MAN.setdefault(name, {'files': [], 'loop': None})['files'].append(fn)
    USED.setdefault(i, set()).add(name)
    return size

def oneshot(name, i, max_len=None, start_db=-40, end_db=-50, peak=-1.0, hp=30, fout=0.06, kbps=96, sr=44100, idx=None, rms=None, offset=0, lp=None):
    a = src(i)
    if offset: a = a[int(offset * SR):]
    a = trim(a, start_db, end_db, pre=0.003, max_len=max_len)
    if hp: a = hpf2(a, hp)
    if lp: a = lpf(a, lp)
    a = fade(a, 0.0015, min(fout, len(a) / SR * 0.5))
    a = norm_rms(a, rms) if rms else norm_peak(a, peak)
    return put(name, a, i, kbps, sr, idx)

def onsets(a, min_gap=0.2, rise_db=10, rel_db=-30):
    e = envelope(a, 441); d = db(e / (e.max() + 1e-12)); out = []
    for k in range(5, len(d)):
        if d[k] < rel_db: continue
        if d[k] - d[max(0, k - 5):k].min() >= rise_db and (not out or (k - out[-1]) * 0.01 >= min_gap):
            out.append(k)
    return [k * 0.01 for k in out]

def steps(name, i, n, length, min_gap=0.25, rise=10, rel=-28, hp=60, kbps=80, offset=0, end=None):
    a = src(i)
    if offset or end: a = a[int(offset * SR): int(end * SR) if end else None]
    ons = onsets(a, min_gap, rise, rel)
    segs = []
    for t in ons:
        s0 = int(max(0, t - 0.012) * SR); s1 = s0 + int(length * SR)
        if s1 > len(a): continue
        seg = a[s0:s1]
        pk = np.max(np.abs(seg))
        if pk > 0.995: continue   # clipped
        segs.append((float(np.sqrt(np.mean(seg ** 2))), seg))
    # Keep the n most typical (median loudness) steps.
    segs.sort(key=lambda x: x[0]); mid = len(segs) // 2
    pick = segs[max(0, mid - n // 2): max(0, mid - n // 2) + n]
    for k, (_, seg) in enumerate(pick):
        seg = hpf2(seg, hp); seg = fade(seg, 0.002, length * 0.45); seg = norm_rms(seg, -20)
        put(name, seg, i, kbps, 44100, k)
    return len(pick), len(ons)

def make_loop(name, i, start, length, xfade=0.35, ch=1, kbps=64, sr=44100, hp=30, peak=-2.0, pad=0.08, rms=None):
    a = src(i, ch)
    s = int(start * SR); L = int(length * SR); X = int(xfade * SR)
    seg = a[s:s + L + X].copy()
    if len(seg) < L + X: raise RuntimeError(f'{name}: source too short')
    if hp: seg = hpf2(seg, hp)
    # crossfade the extra tail into the head (equal power) -> seamless loop of length L
    t = np.linspace(0, 1, X); fi = np.sin(t * np.pi / 2); fo = np.cos(t * np.pi / 2)
    if seg.ndim > 1: fi = fi[:, None]; fo = fo[:, None]
    loop = seg[:L].copy(); loop[:X] = seg[:X] * fi + seg[L:L + X] * fo
    loop = norm_rms(loop, rms) if rms else norm_peak(loop, peak)
    P = int(pad * SR)
    full = np.concatenate([loop[-P:], loop, loop[:P]], axis=0)   # padding = the loop itself (MP3 offsets cannot click)
    size = put(name, full, i, kbps, sr)
    MAN[name]['loop'] = [round(pad, 4), round(pad + L / SR, 4)]
    return size

R = {}
def go(label, f):
    try: R[label] = f()
    except Exception as e: R[label] = 'ERR ' + str(e)[:120]

# ---------- Guns (one recording each; the game varies pitch a little and adds the street echo) ----------
go('pistol', lambda: oneshot('gun_pistol', 427592, max_len=1.25, fout=0.5))
go('gold', lambda: oneshot('gun_gold', 427594, max_len=1.3, fout=0.5))
go('smg', lambda: oneshot('gun_smg', 258198, max_len=0.3, fout=0.1, start_db=-45))
go('rifle', lambda: oneshot('gun_rifle', 427596, max_len=1.0, fout=0.45))
go('dmr', lambda: oneshot('gun_dmr', 855843, max_len=1.6, fout=0.7))
go('sniper', lambda: oneshot('gun_sniper', 514228, max_len=2.3, fout=0.9))
go('shotgun', lambda: oneshot('gun_shotgun', 427595, max_len=1.2, fout=0.5))
go('far1', lambda: oneshot('gun_far', 385812, max_len=1.3, fout=0.5, idx=0, lp=5000))
go('far2', lambda: oneshot('gun_far', 541164, max_len=2.2, fout=0.8, idx=1, lp=5000))
# ---------- Gun handling ----------
go('rel_p', lambda: oneshot('reload_pistol', 396331, max_len=0.9, peak=-3, kbps=80))
go('rel_r', lambda: oneshot('reload_rifle', 674742, max_len=1.5, peak=-3, kbps=80))
go('pump', lambda: oneshot('pump', 613801, max_len=0.7, peak=-3, kbps=80))
go('bolt', lambda: oneshot('bolt', 620928, max_len=1.5, peak=-3, kbps=80))
go('dry', lambda: oneshot('dry', 674568, max_len=0.25, peak=-4, kbps=80))
go('holster', lambda: oneshot('holster', 388819, max_len=0.9, peak=-5, kbps=80))
go('casing', lambda: oneshot('casing', 620929, max_len=0.55, peak=-6, kbps=80, start_db=-30))
go('imp_metal', lambda: oneshot('impact_metal', 351371, max_len=0.4, peak=-3, kbps=80))
go('ricochet', lambda: oneshot('ricochet', 392975, max_len=0.5, peak=-3, kbps=80))
go('whiz', lambda: oneshot('whiz', 789222, max_len=0.75, peak=-2, kbps=80))
go('body_hit', lambda: oneshot('body_hit', 458867, max_len=0.3, peak=-3, kbps=80))
# ---------- Fists ----------
go('punch0', lambda: oneshot('punch', 244513, max_len=0.35, peak=-1, kbps=80, idx=0))
go('punch1', lambda: oneshot('punch', 94778, max_len=0.4, peak=-1, kbps=80, idx=1))
go('punch2', lambda: oneshot('punch', 517744, max_len=0.45, peak=-1, kbps=80, idx=2))
go('swing0', lambda: oneshot('swing', 389590, max_len=0.3, peak=-3, kbps=80, idx=0))
go('swing1', lambda: oneshot('swing', 59988, max_len=0.28, peak=-3, kbps=80, idx=1))
go('fall0', lambda: oneshot('bodyfall', 187136, max_len=0.7, peak=-3, kbps=80, idx=0))
go('fall1', lambda: oneshot('bodyfall', 82027, max_len=0.35, peak=-3, kbps=80, idx=1))
go('land', lambda: oneshot('land', 572459, max_len=0.4, peak=-4, kbps=80))
# ---------- Footsteps (real steps cut from recordings) ----------
go('st_hard', lambda: steps('step_hard', 521590, 6, 0.26, min_gap=0.3))
go('st_run', lambda: steps('step_run', 443218, 6, 0.2, min_gap=0.25))
go('st_tile', lambda: steps('step_tile', 50725, 6, 0.22, min_gap=0.3))
go('st_sand', lambda: steps('step_sand', 384082, 6, 0.28, min_gap=0.35, rise=7, rel=-26))
go('st_water', lambda: steps('step_water', 249930, 5, 0.32, min_gap=0.25, rise=6, rel=-22))
# ---------- Explosions, cars ----------
go('expl_big', lambda: oneshot('expl_big', 235968, max_len=4.2, fout=2.2, start_db=-30, kbps=96))
go('expl_car', lambda: oneshot('expl_small', 843247, max_len=0.75, fout=0.35, kbps=96))
go('expl_bomb', lambda: oneshot('expl_bomb', 220062, max_len=3.2, fout=1.6, kbps=96))
go('crash', lambda: oneshot('crash', 237375, max_len=2.4, fout=1.0, kbps=80))
go('bump', lambda: oneshot('bump', 332056, max_len=0.3, kbps=80))
go('door', lambda: oneshot('car_door', 208695, max_len=0.45, peak=-3, kbps=80))
go('horn0', lambda: oneshot('horn', 423990, max_len=0.65, peak=-3, kbps=80, idx=0))
go('horn1', lambda: oneshot('horn', 434878, max_len=0.7, peak=-3, kbps=80, idx=1))
go('horn2', lambda: oneshot('horn', 170243, max_len=0.4, peak=-3, kbps=80, idx=2))
# ---------- Street life ----------
go('crow0', lambda: oneshot('crow', 361470, max_len=0.45, peak=-3, kbps=64, idx=0))
go('crow1', lambda: oneshot('crow', 813115, max_len=0.62, peak=-3, kbps=64, idx=1))
go('dog0', lambda: oneshot('dog', 277058, max_len=0.35, peak=-3, kbps=64, idx=0))
go('dog1', lambda: oneshot('dog', 386766, max_len=1.5, peak=-3, kbps=64, idx=1))
go('bell', lambda: oneshot('bell', 271627, max_len=4.5, fout=1.8, peak=-3, kbps=64, start_db=-30))
go('radio', lambda: oneshot('radio', 648463, max_len=2.2, fout=0.3, peak=-3, kbps=64, hp=300, lp=4000))
go('chirp', lambda: oneshot('radio_chirp', 825989, max_len=0.3, peak=-3, kbps=64))
go('thunder', lambda: oneshot('thunder', 193170, max_len=5.5, fout=2.5, start_db=-30, kbps=64))
go('till', lambda: oneshot('till', 202531, max_len=2.0, peak=-4, kbps=64))
go('coin', lambda: oneshot('coin', 146723, max_len=0.2, peak=-6, kbps=64))
go('hiss', lambda: oneshot('hiss', 406089, max_len=1.2, offset=0.6, peak=-6, kbps=64, start_db=-30))
# ---------- Loops ----------
go('L_engine', lambda: make_loop('engine', 325808, 0.2, 1.6, xfade=0.2, kbps=64))
go('L_siren', lambda: make_loop('siren', 156869, 6.0, 7.0, xfade=0.4, kbps=64))
go('L_heli', lambda: make_loop('heli', 187678, 0.3, 4.0, xfade=0.3, kbps=64))
go('L_screech', lambda: make_loop('screech', 104026, 0.35, 0.9, xfade=0.2, kbps=64))
go('L_fuse', lambda: make_loop('fuse', 372186, 0.8, 2.0, xfade=0.3, kbps=56))
go('L_fire', lambda: make_loop('fire', 249418, 2.0, 6.0, xfade=0.6, kbps=56))
go('L_street', lambda: make_loop('amb_street', 319360, 0.5, 12.0, xfade=1.2, kbps=64, rms=-20))
go('L_market', lambda: make_loop('amb_market', 263635, 10.0, 14.0, xfade=1.5, kbps=64, rms=-20))
go('L_birds', lambda: make_loop('amb_birds', 327445, 5.0, 12.0, xfade=1.2, kbps=56, rms=-22))
go('L_crickets', lambda: make_loop('amb_crickets', 129678, 1.0, 9.0, xfade=1.0, kbps=56, rms=-22))
go('L_sea', lambda: make_loop('amb_sea', 530699, 2.0, 14.0, xfade=1.5, kbps=56, rms=-20))
go('L_rain', lambda: make_loop('amb_rain', 242889, 3.0, 12.0, xfade=1.2, kbps=56, rms=-20))

for k, v in R.items(): print(k, v)
json.dump(MAN, open(f'{OUT}/manifest.json', 'w'), indent=1)
lines = ['CITY THIEF - sound effects', '', 'All recordings come from freesound.org and were released under CC0 (public domain) by their',
         'authors - thank you! They were trimmed, cleaned, levelled and turned into loops for the game.', '']
for i, names in sorted(USED.items()):
    m = meta.get(str(i), {})
    lines.append(f"{', '.join(sorted(names))}: \"{m.get('title', '?')}\" by {m.get('user', '?')} - https://freesound.org/s/{i}/ (CC0)")
open(f'{OUT}/CREDITS.txt', 'w').write('\n'.join(lines) + '\n')
tot = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
print('files', len(os.listdir(OUT)), 'total KB', tot // 1024)
