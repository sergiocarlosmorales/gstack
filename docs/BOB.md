# IBM Bob Shell — Reference for LLMs and Contributors

This document records everything learned while adding bob as a gstack host. It is written for an LLM or contributor who needs to extend, debug, or reimplement the bob integration with no prior context.

For the user-facing deployment guide, see [BOB_DEPLOYMENT.md](BOB_DEPLOYMENT.md).

---

## What bob is

[IBM Bob Shell](https://bob.ibm.com/docs/shell) is an AI coding assistant — think Claude Code but from IBM. It runs as the `bob` CLI binary, reads a context file called `AGENTS.md` (like `CLAUDE.md` for Claude Code), and supports slash commands loaded from flat `.md` files.

**Version tested:** v1.0.3  
**Primary docs:** https://bob.ibm.com/docs/shell  
**Trusted folders docs:** https://bob.ibm.com/docs/shell/security/trusted-folders

> **Gotcha:** bob's docs site is JavaScript-rendered. `curl` returns blank HTML. Use a browser or the `WebFetch` tool (not raw `curl`) to read the docs.

---

## How bob discovers slash commands

Bob reads flat `.md` files from two locations:

| Location | Scope |
|----------|-------|
| `~/.bob/commands/` | Global — available in all projects |
| `.bob/commands/` in project root | Local — overrides globals for that project |

The **filename without `.md`** becomes the slash command name:
- `~/.bob/commands/gstack-ship.md` → `/gstack-ship` in bob
- `~/.bob/commands/gstack-investigate.md` → `/gstack-investigate`

Bob calls this the `IBMMarkdownCommandLoader`. It runs at startup via Node.js filesystem calls — **not** through the `read_file` agent tool. This matters for sandboxing (see below).

**Frontmatter bob recognises:** `description`, `argument-hint`. The host config uses allowlist mode (`keepFields: ['name', 'description']`) to strip everything else.

---

## Context / instructions file

Bob uses `AGENTS.md`, not `CLAUDE.md`. The host config must include the path rewrite:

```typescript
{ from: 'CLAUDE.md', to: 'AGENTS.md' }
```

Same convention as hermes and openclaw.

---

## Tool name mapping

Claude Code tool names appear throughout gstack skill prose. The `toolRewrites` in `hosts/bob.ts` rewrites them for bob:

| Claude Code | bob |
|-------------|-----|
| `use the Bash tool` | `use the execute_command tool` |
| `use the Read tool` | `use the read_file tool` |
| `use the Write tool` | `use the write_to_file tool` |
| `use the Edit tool` | `use the apply_diff tool` |
| `use the Grep tool` | `use search_files` |
| `use the Glob tool` | `use list_files` |
| `use the Agent tool` | `use a sub-agent` |
| `AskUserQuestion` | `ask_followup_question` |

`ask_followup_question` is a simple follow-up prompt — it does not support structured multi-option choices like gstack's `AskUserQuestion` format. Interactive gates that need structured options are suppressed (see suppressedResolvers below).

---

## File sandbox (the hardest part)

Bob's `read_file` **agent tool** is sandboxed to trusted folders. By default only the project workspace is trusted.

**Error message when a path is outside trusted folders:**
```
File path must be within one of the workspace directories: /path/to/project
or within the project temp directory: /Users/scrls/.bob/tmp/<session-hash>
```

**Critical distinction:**
- `IBMMarkdownCommandLoader` reads `~/.bob/commands/*.md` at startup using Node.js fs — **not sandboxed**
- The `read_file` agent tool IS sandboxed — this is what breaks cross-skill loading

**Trusted folders config:** `~/.bob/trustedFolders.json`

The UI shows a dialog on first open of a folder: Trust / Trust parent folder / Don't trust. The exact JSON format of this file was not determined during initial implementation — inspect it with `cat ~/.bob/trustedFolders.json` on a real bob machine.

### Why cross-skill loading breaks

Skills reference each other by file path: `$GSTACK_ROOT/office-hours/SKILL.md`. The gstack preamble sets `GSTACK_ROOT="$HOME/.bob/skills/gstack"`. That path is outside the project workspace, so `read_file` is blocked.

### Solutions implemented

Two approaches, both work:

**Option A — Global (preferred if `~/.bob/` is trusted):**
`setup-bob` copies all skill SKILL.md files as real files (not symlinks) to `~/.bob/skills/gstack/{name}/SKILL.md`. If bob auto-trusts `~/.bob/`, cross-skill loading works globally with no per-project setup.

**Option B — Per-project fallback:**
`setup-bob-project` copies skill files into `<project>/.bob/skills/gstack/{name}/SKILL.md`. The preamble detects this local directory and prefers it:
```bash
[ -d "$_ROOT/.bob/skills/gstack" ] && GSTACK_ROOT="$_ROOT/.bob/skills/gstack"
```
Bob can always read files within the project workspace.

**Why copies, not symlinks:** If bob resolves symlink targets before checking sandbox access, a symlink pointing to `~/.bob/skills/gstack/` from inside the project would still be blocked. Actual file copies are always safe.

---

## Directory naming mismatch

The generator creates skill directories with the `gstack-` prefix:
```
repo/.bob/skills/gstack-office-hours/SKILL.md
```

But the preamble references skills without it:
```bash
$GSTACK_ROOT/office-hours/SKILL.md
```

The setup scripts strip `gstack-` when populating `~/.bob/skills/gstack/`:
```bash
skill_name="${dir_name#gstack-}"   # "gstack-office-hours" → "office-hours"
mkdir -p "$BOB_GSTACK/$skill_name"
cp "$skill_dir/SKILL.md" "$BOB_GSTACK/$skill_name/SKILL.md"
```

---

## File layout after setup-bob runs

```
~/.bob/
  commands/
    gstack.md                   ← symlink to repo/.bob/skills/gstack/SKILL.md
    gstack-ship.md              ← symlink to repo/.bob/skills/gstack-ship/SKILL.md
    gstack-office-hours.md      ← symlink (may be broken if repo/.bob/ not generated)
    ...
  skills/
    gstack/                     ← GSTACK_ROOT (runtime root)
      bin/                      ← symlink → repo/bin/
      browse/dist/              ← symlink → repo/browse/dist/
      gstack-upgrade/           ← symlink → repo/gstack-upgrade/
      ETHOS.md                  ← symlink
      review/                   ← symlinks to checklist files
      office-hours/
        SKILL.md                ← COPY of repo/.bob/skills/gstack-office-hours/SKILL.md
      plan-ceo-review/
        SKILL.md                ← COPY
      ship/
        SKILL.md                ← COPY
      ...                       ← all skills as copies, without gstack- prefix
  trustedFolders.json           ← bob's trusted folder registry (format unknown)
```

---

## Host config: hosts/bob.ts

Bob's host config is modelled directly on `hosts/hermes.ts` (hermes is the closest analog — also uses `AGENTS.md` and full toolRewrites). Key fields:

```typescript
{
  name: 'bob',
  hostSubdir: '.bob',
  globalRoot: '.bob/skills/gstack',
  usesEnvVars: true,            // required — test "all external hosts use env vars" enforces this
  frontmatter: { mode: 'allowlist', keepFields: ['name', 'description'] },
  generation: { generateMetadata: false, skipSkills: ['codex'] },
}
```

**`usesEnvVars: true`** means the generated skills use `$GSTACK_ROOT`, `$GSTACK_BIN`, `$GSTACK_BROWSE`, `$GSTACK_DESIGN` instead of literal paths. These env vars must be set in the user's shell config.

---

## suppressedResolvers — intentional vs accidental

| Resolver | Suppressed? | Reason |
|----------|-------------|--------|
| `CODEX_SECOND_OPINION` | ✅ intentional | Runs `codex` CLI binary — not installed on bob-only machines |
| `CODEX_PLAN_REVIEW` | ✅ intentional | Same — runs `codex` CLI |
| `REVIEW_ARMY` | ✅ intentional | Requires parallel multi-Agent dispatch in a single turn — uncertain if bob supports this |
| `ADVERSARIAL_STEP` | ⚠️ accidental | Cargo-culted from hermes. Both the Codex pass (gracefully skipped) and the Claude subagent pass could run on bob. Safe to un-suppress. |
| `DESIGN_OUTSIDE_VOICES` | ⚠️ accidental | Same — Codex pass gracefully degrades, Claude subagent pass would work. Safe to un-suppress. |

**Why hermes suppressedResolvers don't all apply to bob:** Hermes spawns Claude Code sessions, so having Claude Code spawn more Claude Code sessions (ADVERSARIAL_STEP, REVIEW_ARMY) would recurse. Bob is a standalone agent, so those concerns don't apply the same way.

---

## Setup scripts

### setup-bob (new machine)
Located at repo root. Run once per machine. Does:
1. Preflight checks (bob, bun, git on PATH)
2. `bun install`
3. `bun run build` (compiles `browse/dist/browse` binary)
4. `bun run gen:skill-docs --host bob` (generates `.bob/skills/` in repo — always explicit, not relying on build)
5. `./setup --host bob` (creates `~/.bob/commands/` symlinks + `~/.bob/skills/gstack/` runtime)
6. Copies all skill SKILL.md files to `~/.bob/skills/gstack/{name}/SKILL.md`
7. Appends `GSTACK_*` env vars to shell config
8. Notes that `setup-bob-project` is available as fallback if cross-skill loading still fails

### setup-bob-project (per-project fallback)
Located at repo root. Run in each project if cross-skill loading fails. Does:
1. Reads skills from `$REPO_DIR/.bob/skills/` (not `~/.bob/commands/` — those may be broken symlinks)
2. Auto-runs `gen:skill-docs --host bob` if `.bob/skills/` is missing
3. Copies each `gstack-{name}/SKILL.md` to `<project>/.bob/skills/gstack/{name}/SKILL.md`
4. Symlinks runtime assets (bin, browse, gstack-upgrade) from `~/.bob/skills/gstack/` into the project tree
5. Adds `.bob/` to project `.gitignore`

---

## env vars required in user's shell config

```bash
export GSTACK_ROOT="$HOME/.bob/skills/gstack"
export GSTACK_BIN="$GSTACK_ROOT/bin"
export GSTACK_BROWSE="$GSTACK_ROOT/browse/dist"
export GSTACK_DESIGN="$GSTACK_ROOT/design/dist"
```

`setup-bob` writes these automatically with the marker `# gstack-bob env vars` (idempotent).

---

## Invoking skills in bob

Start a bob session in your project:
```bash
cd your-project
bob
```

Then type the slash command in the session:
```
/gstack-plan-ceo-review
/gstack-investigate
/gstack-ship
```

The command name comes from the filename in `~/.bob/commands/` with `.md` stripped.

---

## Open questions (unverified as of initial implementation)

1. **Is `~/.bob/` trusted by default?** If bob auto-trusts its own config directory, `setup-bob-project` (per-project setup) is never needed. Check with: does cross-skill loading work from a fresh project with only `setup-bob` run?

2. **`trustedFolders.json` format** — inspect with `cat ~/.bob/trustedFolders.json` on a machine that has run bob at least once. Can we safely add `~/.bob/skills/gstack` programmatically using Node.js `JSON.parse/stringify`?

3. **Parallel subagent dispatch** — does bob support multiple sub-agent calls in a single turn? If yes, `REVIEW_ARMY` can be un-suppressed and parallel specialist reviewers work.

4. **`ask_followup_question` structured options** — bob's equivalent is a simple text follow-up, not structured multi-option questions. Are there bob-specific ways to present structured choices that could replace `AskUserQuestion` format?

5. **Exact bob slash command invocation from CLI** — `bob /gstack-ship` may or may not work as a one-liner. Confirmed in-session: type `/gstack-ship` in an active bob REPL. CLI flag syntax unverified.

---

## Adding bob support from scratch (recipe for LLMs)

If you need to reimplement or update the bob host:

1. **Read `docs/ADDING_A_HOST.md`** — the 6-step process for adding any host
2. **Copy `hosts/hermes.ts` as starting point** — hermes is the closest analog (AGENTS.md, full toolRewrites, suppressedResolvers)
3. **Key differences from hermes:** bob is a standalone agent (not a Claude Code orchestrator), so the setup script should actually install (like opencode), not just print a message and exit
4. **The flat-file mismatch:** bob reads flat `.md` files in `~/.bob/commands/`, but the generator produces subdirectory structures. `link_bob_skill_dirs()` in `setup` creates the flat files; `setup-bob` copies the subdirectory tree into `~/.bob/skills/gstack/` for cross-skill loading
5. **Test count:** `test/host-config.test.ts` has a hardcoded host count — update it when adding bob (was 10, becomes 11)
6. **Run:** `bun test test/host-config.test.ts test/skill-validation.test.ts` — must pass before shipping
7. **Verify no path leakage:** `grep -r "\.claude/skills" .bob/` must return empty after generation
