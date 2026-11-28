"""Write web-demo/src/sfxlist.js from the sound build's out/manifest.json.
Run from the folder that holds out/ :  python3 make_list.py path/to/web-demo/src/sfxlist.js"""
import json, sys

man = json.load(open('out/manifest.json'))
lines = ['// Sound files (made by the sound build from CC0 recordings - see assets/sfx/CREDITS.txt).',
         '// name: [files, loop region in seconds or null]', 'export const SFX_LIST = {']
for name, v in man.items():
    lines.append(f"  {name}: [{json.dumps(v['files'])}, {json.dumps(v['loop'])}],".replace('[0.', '[0.').replace(',0', ', 0'))
lines.append('};')
open(sys.argv[1], 'w').write('\n'.join(lines) + '\n')
print(len(man), 'sounds')
