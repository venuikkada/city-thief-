"""Search freesound.org (CC0 only) through the public search page and download HQ previews."""
import re, sys, json, os, urllib.parse, urllib.request, time, html

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) sound-research'}
ATTR = re.compile(r'data-(sound-id|username|mp3|title|duration|samplerate|num-downloads)="([^"]*)"')

def fetch(url, binary=False, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                b = r.read()
                return b if binary else b.decode('utf8', 'replace')
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(2 + k * 2)

def search(q, dmin=0, dmax=10, sort='Downloads (most first)', page=1):
    f = 'license:"Creative Commons 0" duration:[%g TO %g]' % (dmin, dmax)
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': f, 's': sort, 'page': page})
    h = fetch(url)
    out = []
    for blk in h.split('class="bw-player"')[1:]:
        blk = blk[:2500]
        d = dict(ATTR.findall(blk))
        if 'sound-id' not in d: continue
        out.append({'id': int(d['sound-id']), 'user': d.get('username'), 'title': html.unescape(d.get('title', '')),
                    'dur': float(d.get('duration', 0) or 0), 'sr': d.get('samplerate'), 'dl': int(d.get('num-downloads', 0) or 0),
                    'hq': (d.get('mp3') or '').replace('-lq.mp3', '-hq.mp3')})
    return out

def download(s, folder):
    os.makedirs(folder, exist_ok=True)
    p = os.path.join(folder, '%d.mp3' % s['id'])
    if not os.path.exists(p):
        open(p, 'wb').write(fetch(s['hq'], binary=True))
    return p

if __name__ == '__main__':
    q = sys.argv[1]; dmin = float(sys.argv[2]) if len(sys.argv) > 2 else 0; dmax = float(sys.argv[3]) if len(sys.argv) > 3 else 10
    for s in search(q, dmin, dmax)[:15]:
        print(s['id'], '|', s['title'][:60], '|', s['user'], '|', round(s['dur'], 2), 's |', s['dl'], 'dl')
