#!/usr/bin/env bash
# Hook 3: Context Persistence (Stop)
# Registra no session-log.md quando Claude encerra a sessão.
# Sempre exit 0.

TMPFILE=$(mktemp)
cat > "$TMPFILE"
trap "rm -f '$TMPFILE'" EXIT

python3 - "$TMPFILE" << 'PYEOF'
import os, sys, json, datetime

try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    file_path = data.get('tool_input', {}).get('file_path', '')
except Exception:
    file_path = ''

now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
# CLAUDE_PROJECT_DIR is set by Claude Code for hook subprocesses; fall back to
# cwd so this doesn't go stale again on the next machine/repo-path migration.
project_dir = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
log_path = os.path.join(project_dir, '.claude', 'session-log.md')

with open(log_path, 'a') as f:
    f.write(f'\n## Sessão {now}\n')
    if file_path:
        f.write(f'- Último arquivo editado: {file_path}\n')
    else:
        f.write('- Sessão encerrada\n')

sys.exit(0)
PYEOF

exit 0
