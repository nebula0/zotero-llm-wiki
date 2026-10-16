"""Print the e2e result file; exit 1 if any step failed."""
import json, sys

r = json.load(open(sys.argv[1]))
if r.get('fatal'):
    print('FATAL', r['fatal'])
failed = 0
for name, step in r['steps'].items():
    info = step.get('info', '')
    text = info if isinstance(info, str) else json.dumps(info, ensure_ascii=False)
    print('✅' if step['ok'] else '❌', name, (text or '').replace('\n', ' ')[:200])
    failed += not step['ok']
sys.exit(1 if failed or r.get('fatal') else 0)
