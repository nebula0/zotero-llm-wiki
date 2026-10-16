"""Write a fake `claude` CLI for the e2e test: it records its arguments, stdin and config dir, then
streams a canned stream-json answer (call 1: three quotes, one not in the paper; call 2: a follow-up)."""
import json, os, stat, sys

d = sys.argv[1]
os.makedirs(os.path.join(d, 'config'), exist_ok=True)
answers = [
    'They find a 512-token window keeps most of the accuracy ⟦Our main finding is that a sliding window of '
    '512 tokens recovers ninety-four percent of full attention accuracy⟧. It was only tested on English '
    '⟦our experiments only cover English text⟧, and **one claim** is unsupported ⟦This sentence is not in the paper at all⟧.',
    'They did not test models larger than 1.3B ⟦we did not test models larger than 1.3 billion parameters⟧.',
]
for n, text in enumerate(answers, 1):
    lines = [{'type': 'system', 'subtype': 'init', 'session_id': 'fake-session-1', 'model': 'claude-fake'}]
    for i in range(0, len(text), 25):
        lines.append({'type': 'stream_event', 'event': {'type': 'content_block_delta', 'index': 0,
                      'delta': {'type': 'text_delta', 'text': text[i:i + 25]}}})
    lines.append({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': text,
                  'session_id': 'fake-session-1', 'modelUsage': {'claude-fake': {}},
                  'usage': {'input_tokens': 5, 'cache_read_input_tokens': 100, 'output_tokens': 20}})
    with open(os.path.join(d, f'reply-{n}.jsonl'), 'w') as f:
        f.write('\n'.join(json.dumps(x, ensure_ascii=False) for x in lines) + '\n')

script = os.path.join(d, 'claude')
with open(script, 'w') as f:
    f.write('''#!/bin/bash
D="$(cd "$(dirname "$0")" && pwd)"
n=1; while [ -f "$D/call-$n.args" ]; do n=$((n+1)); done
printf '%s\\n' "$@" > "$D/call-$n.args"
cat > "$D/call-$n.stdin"
echo "CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR" > "$D/call-$n.env"
while IFS= read -r line; do printf '%s\\n' "$line"; sleep 0.05; done < "$D/reply-$n.jsonl"
''')
os.chmod(script, os.stat(script).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
