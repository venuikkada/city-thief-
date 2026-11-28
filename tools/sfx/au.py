"""Audio helpers: load (ffmpeg -> float), stats, trim, fades, loudness, encode."""
import numpy as np, subprocess, os
SR = 44100
def load(path, ch=1, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(sr), '-'], capture_output=True).stdout
    a = np.frombuffer(raw, dtype='<f4').copy()
    return a if ch == 1 else a.reshape(-1, ch)
def mono(a): return a if a.ndim == 1 else a.mean(axis=1)
def envelope(a, win=441):
    m = mono(a); n = len(m) // win
    if n == 0: return np.array([np.sqrt(np.mean(m ** 2))])
    return np.sqrt(np.mean(m[:n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
def db(x): return 20 * np.log10(np.maximum(1e-9, x))
def stats(a):
    m = mono(a); pk = float(np.max(np.abs(m)) + 1e-9); e = envelope(a)
    above = np.where(db(e / (e.max() + 1e-12)) > -40)[0]
    clip = float(np.mean(np.abs(m) > 0.985))
    floor = float(db(np.percentile(e, 10) / (e.max() + 1e-12)))
    return {'dur': round(len(m) / SR, 2), 'peak_db': round(float(db(pk)), 1), 'peak_t': round(float(np.argmax(np.abs(m)) / SR), 3),
            'on': round(float(above[0] * 0.01), 2) if len(above) else 0, 'off': round(float(above[-1] * 0.01 + 0.01), 2) if len(above) else 0,
            'floor_db': round(floor, 1), 'clip%': round(clip * 100, 2), 'n_loud': int(np.sum(np.diff((db(e / (e.max() + 1e-12)) > -12).astype(int)) == 1))}
def trim(a, start_db=-45, end_db=-55, pre=0.004, max_len=None):
    m = mono(a); e = envelope(a, 64); ref = e.max() + 1e-12; d = db(e / ref)
    idx = np.where(d > start_db)[0]; s = max(0, int(idx[0] * 64 - pre * SR)) if len(idx) else 0
    idx2 = np.where(d > end_db)[0]; t = min(len(m), int((idx2[-1] + 1) * 64)) if len(idx2) else len(m)
    if max_len: t = min(t, s + int(max_len * SR))
    return a[s:t]
def fade(a, fin=0.002, fout=0.05):
    a = a.copy(); n = len(a); i = int(fin * SR); o = int(min(fout * SR, n // 2))
    if i: a[:i] *= np.linspace(0, 1, i)[:, None] if a.ndim > 1 else np.linspace(0, 1, i)
    if o: a[n - o:] *= (np.linspace(1, 0, o) ** 2)[:, None] if a.ndim > 1 else np.linspace(1, 0, o) ** 2
    return a
def norm_peak(a, dbfs=-1.0): pk = np.max(np.abs(a)) + 1e-9; return a * (10 ** (dbfs / 20) / pk)
def norm_rms(a, dbfs=-20.0, win=None):
    m = mono(a); r = np.sqrt(np.mean(m ** 2)) + 1e-9; g = 10 ** (dbfs / 20) / r
    out = a * g; pk = np.max(np.abs(out))
    return out / pk * 0.97 if pk > 0.97 else out
def hp(a, fc):  # one-pole high-pass (gentle) to remove rumble
    if fc <= 0: return a
    rc = 1 / (2 * np.pi * fc); al = rc / (rc + 1 / SR); y = np.zeros_like(a); px = 0; py = 0
    x = a
    y[0] = x[0]
    for i in range(1, len(x)): y[i] = al * (y[i - 1] + x[i] - x[i - 1])
    return y
def save_mp3(a, path, kbps=96, sr=44100):
    a = np.clip(a, -1, 1).astype('<f4'); ch = 1 if a.ndim == 1 else a.shape[1]
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-', '-ar', str(sr), '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=a.tobytes(), capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr.decode()[:300])
    return os.path.getsize(path)
