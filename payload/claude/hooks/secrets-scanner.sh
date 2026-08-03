#!/usr/bin/env bash
# Hook 1: Secrets Scanner (PreToolUse — Write|Edit)
# Bloqueia escrita de credenciais hardcoded no código.
# Exit 0 = permite; Exit 2 = bloqueia (Claude vê o stdout como motivo).

TMPFILE=$(mktemp)
cat > "$TMPFILE"
trap "rm -f '$TMPFILE'" EXIT

python3 - "$TMPFILE" << 'PYEOF'
import sys, json, re

try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)

# Write usa .content; Edit usa .new_string
content = (
    data.get('tool_input', {}).get('content') or
    data.get('tool_input', {}).get('new_string') or
    ''
)

if not content:
    sys.exit(0)

patterns = [
    (
        r'-----BEGIN (RSA |EC |)PRIVATE KEY-----',
        'Chave privada PEM detectada (-----BEGIN PRIVATE KEY-----).\n'
        'Nunca commite chaves privadas. Use variáveis de ambiente ou secrets manager.'
    ),
    (
        r'JWT_SECRET\s*=\s*["\'][^\$]',
        'JWT_SECRET hardcoded detectado.\n'
        'Use variáveis de ambiente: JWT_SECRET = os.getenv("JWT_SECRET")'
    ),
    (
        r'(PASSWORD|PASSWD|SECRET|API_KEY)\s*=\s*["\'][^\$\{]',
        'Credencial hardcoded detectada (PASSWORD/PASSWD/SECRET/API_KEY).\n'
        'Use variáveis de ambiente: os.getenv("NOME_DA_VAR")'
    ),
    (
        r'private_key\s*=\s*["\']',
        'private_key hardcoded detectado em código Python/TS.\n'
        'Nunca coloque chaves privadas diretamente no código-fonte.'
    ),
]

for pattern, message in patterns:
    if re.search(pattern, content):
        print(f"BLOCKED: {message}")
        sys.exit(2)

sys.exit(0)
PYEOF
