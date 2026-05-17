# gstack for IBM Bob Shell — Deployment Guide

This guide covers deploying gstack on a machine that has **bob** installed but does NOT have Claude Code. Follow these steps on the target machine.

## Prerequisites

- **bob** v1.0+ installed and on `$PATH` (verify: `bob --version`)
- **git** installed
- **bun** installed (the build toolchain)
  - Install: `curl -fsSL https://bun.sh/install | bash`
  - Verify: `bun --version`
- Internet access for initial dependency fetch

## Step 1: Clone the repo

```bash
git clone https://github.com/sergiocarlosmorales/gstack
cd gstack
```

> If you're working from a fork, replace the URL with your fork's URL.

## Step 2: Install dependencies

```bash
bun install
```

## Step 3: Build the browse binary

The `browse/dist/browse` binary must be built from source for your platform. The repo does not ship pre-built binaries.

```bash
bun run build
```

This compiles the headless browser CLI (`browse`) and generates all skill docs including the bob variant.

> Takes 30-90 seconds on first run. Subsequent runs are faster (incremental).

## Step 4: Run setup for bob

```bash
./setup --host bob
```

This will:
1. Generate `.bob/skills/` with bob-adapted skill files
2. Create `~/.bob/skills/gstack/` with the gstack runtime (bin, browse binary, etc.)
3. Symlink each skill as `~/.bob/commands/{skill-name}.md` so bob discovers them as slash commands

Example output:
```
gstack ready (bob).
  browse: /path/to/gstack/browse/dist/browse
  bob commands: /home/user/.bob/commands
  bob runtime: /home/user/.bob/skills/gstack

  Add to your shell config (~/.bashrc or ~/.zshrc):
    export GSTACK_ROOT="$HOME/.bob/skills/gstack"
    export GSTACK_BIN="$GSTACK_ROOT/bin"
    export GSTACK_BROWSE="$GSTACK_ROOT/browse/dist"
    export GSTACK_DESIGN="$GSTACK_ROOT/design/dist"
```

## Step 5: Set environment variables

Add the GSTACK_* env vars to your shell config so bob skills can find the gstack runtime:

```bash
# Add to ~/.bashrc or ~/.zshrc
export GSTACK_ROOT="$HOME/.bob/skills/gstack"
export GSTACK_BIN="$GSTACK_ROOT/bin"
export GSTACK_BROWSE="$GSTACK_ROOT/browse/dist"
export GSTACK_DESIGN="$GSTACK_ROOT/design/dist"
```

Then reload: `source ~/.bashrc` (or open a new terminal).

## Step 6: Verify

```bash
# Check skills are linked
ls ~/.bob/commands/ | grep gstack

# Test a skill loads
bob /gstack-ship --help 2>/dev/null || echo "Skills linked — run 'bob /gstack-ship' in a project"
```

You should see gstack-* commands in the listing.

## Step 7: Run per-project setup (required for sub-skill loading)

Bob sandboxes file reads to the project workspace. Skills that invoke other skills (e.g. `/gstack-plan-ceo-review` loading `/gstack-office-hours` inline) read skill files by path. Without this step those reads fail with "File path must be within one of the workspace directories".

Run once per project:

```bash
cd your-project
/path/to/gstack/setup-bob-project
```

This copies skill files into `<project>/.bob/skills/gstack/` and gitignores them. The gstack preamble already has logic to prefer this project-local directory when it exists.

Re-run the command after updating gstack (new skills or templates changed).

## Step 8: Configure AGENTS.md (optional but recommended)

gstack skills look for an `AGENTS.md` file in your project root (equivalent to Claude Code's `CLAUDE.md`). Create one with project-specific config:

```bash
cat > AGENTS.md << 'EOF'
# My Project

## Commands
# Add your project's test/build/deploy commands here
# so gstack skills can use them automatically.
EOF
```

## Updating gstack (and refreshing per-project skills)

To update to a newer version:

```bash
cd /path/to/gstack
git pull
bun run build
./setup --host bob
```

Then refresh each project that uses bob skills:

```bash
cd your-project
/path/to/gstack/setup-bob-project
```

## Troubleshooting

**`bob: command not found`**
Make sure bob is installed and on your PATH. Check with `which bob`.

**Skills not showing up in bob**
Verify the symlinks exist: `ls ~/.bob/commands/`. If missing, re-run `./setup --host bob`.

**`$GSTACK_ROOT` not set errors in skills**
Add the env vars from Step 5 to your shell config and reload.

**browse binary errors**
Make sure `bun run build` completed without errors. The binary at `browse/dist/browse` must be executable: `chmod +x browse/dist/browse`.

**Permission denied on `~/.bob/commands/`**
```bash
mkdir -p ~/.bob/commands
chmod 700 ~/.bob/commands
```
