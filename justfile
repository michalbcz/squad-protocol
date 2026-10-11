# Squad Protocol task runner. Run `just` to list recipes.

set shell := ["bash", "-uc"]

web := "@sp/web"

# List available recipes
default:
    @just --list --unsorted

# Check that the toolchain is installed and versions are compatible
doctor:
    #!/usr/bin/env bash
    set -u
    ok=1
    check() {
      local name=$1 cmd=$2 want=$3
      if command -v "$cmd" >/dev/null 2>&1; then
        printf '  ✔ %-11s %s\n' "$name" "$($cmd --version 2>&1 | head -1)"
      else
        printf '  ✘ %-11s missing (%s)\n' "$name" "$want"; ok=0
      fi
    }
    echo "Required:"
    check node node "Node >= 22"
    check pnpm pnpm "corepack enable && corepack prepare pnpm@latest --activate"
    check just just "brew install just"
    node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' 2>/dev/null \
      || { echo "  ✘ Node >= 22 required"; ok=0; }
    echo "Optional (wrappers / networking):"
    check cargo cargo "Tauri desktop builds: https://rustup.rs"
    check cloudflared cloudflared "tunnel sharing: brew install cloudflared"
    echo "Workspace:"
    [ -d node_modules ] && echo "  ✔ dependencies installed" || { echo "  ✘ run: just install"; ok=0; }
    ls ~/Library/Caches/ms-playwright ~/.cache/ms-playwright 2>/dev/null | grep -q chromium \
      && echo "  ✔ Playwright Chromium" || echo "  ✘ Playwright browser missing (run: just e2e-install)"
    [ "$ok" = 1 ] && echo "All required tools present." || { echo "Some required tools are missing."; exit 1; }

# Install workspace dependencies
install:
    pnpm install

# Start the web dev server (hot reload) on http://localhost:5173
dev:
    pnpm --filter {{web}} dev

# Build and serve the production web bundle on http://localhost:4173
run: build
    pnpm --filter {{web}} preview --port 4173

# Production build of the web app (apps/web/dist)
build:
    pnpm --filter {{web}} build

# Unit tests (engine, AI, i18n, input)
test *args:
    pnpm exec vitest run {{args}}

# Unit tests in watch mode
test-watch:
    pnpm exec vitest

# Type-check all packages and Svelte components
typecheck:
    pnpm typecheck

# Install the Playwright browser used by e2e tests
e2e-install:
    pnpm exec playwright install chromium

# End-to-end tests in a real browser (desktop + mobile touch projects)
e2e *args:
    pnpm exec playwright test {{args}}

# Everything CI runs
check: typecheck test e2e

# Headless AI-vs-AI balance report over N seeds on a scenario
balance seeds="20" scenario="kestrel":
    SEEDS={{seeds}} SCENARIO={{scenario}} pnpm exec vitest run packages/ai/test/balance.test.ts --silent=false

# Create a new Architecture/Design Decision Record: just adr "Use WebSocket relay"
adr title:
    @./scripts/new-adr.sh "{{title}}"

# Remove build output and test artifacts
clean:
    rm -rf apps/*/dist test-results playwright-report coverage

# Remove everything including node_modules
clean-all: clean
    rm -rf node_modules apps/*/node_modules packages/*/node_modules
