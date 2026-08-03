#!/usr/bin/env bash
# Hook: Multi-Language & Cross-Plataform Auto-Format (PostToolUse - Write|Edit)
# Automatically formats the edited file based on its extension
# Always returns exit 0 (never blocks Claude Code execution)

# 1. Temporary file creation compatible with Linux and MacOs
TMPFILE=$(mktemp 2>/dev/null || mktemp -t 'hook_tmp')
trap "rm -f '$TMPFILE'" EXIT

cat > "$TMPFILE"

# 2. Python executable detection (python3 or python)
PYTHON_CMD="python3"
if ! command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python"
fi

# 3. File path extraction and normalization via Python
FILE_PATH=$("$PYTHON_CMD" - "$TMPFILE" << 'PYEOF'
import sys, json, os

try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    path = data.get('tool_input', {}).get('file_path', '')
    if path:
        path = os.path.normpath(path)
    sys.stdout.write(path)
except Exception:
    pass
PYEOF
)

# Exit cleanly if no valid file path is found
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Extract lowercase extension
EXT="${FILE_PATH##*.}"
EXT=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

# Helper function to check if a command exists in the system (supports Windows .cmd/.exe)
has_cmd() {
    command -v "$1" >/dev/null 2>&1 || command -v "$1.cmd" >/dev/null 2>&1
}

# 4. Formatting by language/extension

case "$EXT" in
    # --- Python ---
    py)
        if $PYTHON_CMD -m ruff --version >/dev/null 2>&1; then
            $PYTHON_CMD -m ruff format "$FILE_PATH" > /dev/null 2>&1 || true
        elif has_cmd black; then
            black -q "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- JavaScript / TypeScript / Web / Docs / Configs ---
    js|jsx|ts|tsx|json|css|scss|less|html|vue|svelte|yaml|yml|md|markdown)
        PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
        
        # Check if pnpm, yarn, bun, or npx/prettier are available
        RUNNER=""
        if has_cmd pnpm; then RUNNER="pnpm exec"
        elif has_cmd yarn; then RUNNER="yarn"
        elif has_cmd bun; then RUNNER="bunx"
        elif has_cmd npx; then RUNNER="npx"
        elif has_cmd prettier; then RUNNER="prettier"
        fi

        if [ -n "$RUNNER" ]; then
            # If frontend/ directory exists, attempt to run inside it first
            if [ -d "$PROJECT_DIR/frontend" ]; then
                (cd "$PROJECT_DIR/frontend" && $RUNNER prettier --write "$FILE_PATH") > /dev/null 2>&1 || true
            else
                $RUNNER prettier --write "$FILE_PATH" > /dev/null 2>&1 || true
            fi
        fi
        ;;

    # --- Go ---
    go)
        if has_cmd gofmt; then
            gofmt -w "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- Rust ---
    rs)
        if has_cmd rustfmt; then
            rustfmt "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- C / C++ / Java / C# ---
    c|cpp|cc|cxx|h|hpp|java|cs)
        if has_cmd clang-format; then
            clang-format -i "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- Shell Script ---
    sh|bash)
        if has_cmd shfmt; then
            shfmt -w "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- PHP ---
    php)
        if has_cmd pint; then
            pint "$FILE_PATH" > /dev/null 2>&1 || true
        elif has_cmd php-cs-fixer; then
            php-cs-fixer fix "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- Ruby ---
    rb)
        if has_cmd rubocop; then
            rubocop -a "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- Elixir ---
    ex|exs)
        if has_cmd mix; then
            mix format "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;

    # --- Zig ---
    zig)
        if has_cmd zig; then
            zig fmt "$FILE_PATH" > /dev/null 2>&1 || true
        fi
        ;;
esac

exit 0
