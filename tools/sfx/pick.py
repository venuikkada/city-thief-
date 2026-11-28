import json, sys, os
sys.path.insert(0, 'tools')
from fs import download
R = {}
for f in ['search1.json', 'search2.json', 'search3.json']:
    for k, lst in json.load(open(f)).items():
        for s in lst: R[s['id']] = s
# role -> candidate ids (first = preferred)
PICK = {
 'gun_pistol': [427592, 163456, 385811], 'gun_gold': [330634, 427594], 'gun_smg': [258198, 579531, 160590], 'gun_rifle': [427596, 163457, 432366],
 'gun_dmr': [520934, 855843, 404562], 'gun_sniper': [49513, 514228, 351777], 'gun_shotgun': [427595, 163455, 318973], 'gun_far': [541164, 385812, 210531],
 'reload_pistol': [396331, 432139], 'reload_rifle': [674742, 432141, 363168], 'pump': [613801, 449614], 'bolt': [620928, 802673], 'dry': [674568, 842748], 'holster': [388819, 405538],
 'casing': [620929], 'impact_metal': [351371, 267893], 'ricochet': [392975, 148840], 'whiz': [855248, 789222], 'body_hit': [276600, 458867],
 'punch': [244513, 524956, 94778, 517744], 'whoosh': [60013, 389590, 59988], 'bodyfall': [82027, 187136],
 'step_conc': [459964, 166507, 521590], 'step_run': [443218, 361072], 'step_sand': [384082, 528953], 'step_water': [531566, 249930], 'step_tile': [50725],
 'expl_big': [235968, 220062], 'expl_small': [843247, 47252, 843250], 'engine': [325808, 269771, 421001], 'horn': [423990, 170243, 434878, 563346],
 'crash': [237375, 592388], 'bump': [151624, 332056], 'screech': [104026, 536769], 'door': [208695, 173009], 'siren': [156869, 52906], 'heli': [187678, 172667],
 'amb_street': [319360, 221639, 509181], 'amb_market': [263635, 412824], 'birds': [182500, 327445], 'crow': [361470, 56234, 813115], 'crickets': [129678, 146033],
 'sea': [531015, 530699], 'rain': [167034, 242889], 'thunder': [193170, 244053], 'dog': [277058, 9032, 386766], 'bell': [271627, 390200], 'fire': [249418, 813328],
 'fuse': [372186, 237407], 'hiss': [406089], 'till': [202531, 209578], 'coin': [146723], 'radio': [648463, 825989], 'land': [572459, 364690], 'rickshaw': [723808, 339682],
}
os.makedirs('raw', exist_ok=True)
meta = {}
for role, ids in PICK.items():
    for i in ids:
        s = R.get(i)
        if not s: print('missing meta', role, i); continue
        try: p = download(s, 'raw'); meta[i] = s; print(role, i, os.path.getsize(p), s['title'][:40])
        except Exception as e: print('FAIL', role, i, e)
json.dump({'pick': PICK, 'meta': meta}, open('picked.json', 'w'), indent=0)
