import type { HostConfig } from '../scripts/host-config';

const bob: HostConfig = {
  name: 'bob',
  displayName: 'IBM Bob Shell',
  cliCommand: 'bob',
  cliAliases: [],

  globalRoot: '.bob/skills/gstack',
  localSkillRoot: '.bob/skills/gstack',
  hostSubdir: '.bob',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: null,
  },

  generation: {
    generateMetadata: false,
    skipSkills: ['codex'],
    includeSkills: [],
  },

  pathRewrites: [
    { from: '~/.claude/skills/gstack', to: '~/.bob/skills/gstack' },
    { from: '.claude/skills/gstack', to: '.bob/skills/gstack' },
    { from: '.claude/skills', to: '.bob/skills' },
    { from: 'CLAUDE.md', to: 'AGENTS.md' },
  ],
  toolRewrites: {
    'use the Bash tool': 'use the execute_command tool',
    'use the Write tool': 'use the write_to_file tool',
    'use the Read tool': 'use the read_file tool',
    'use the Edit tool': 'use the apply_diff tool',
    'use the Agent tool': 'use a sub-agent',
    'use the Grep tool': 'use search_files',
    'use the Glob tool': 'use list_files',
    'the Bash tool': 'the execute_command tool',
    'the Read tool': 'the read_file tool',
    'the Write tool': 'the write_to_file tool',
    'the Edit tool': 'the apply_diff tool',
    'AskUserQuestion': 'ask_followup_question',
  },

  suppressedResolvers: [
    'DESIGN_OUTSIDE_VOICES',
    'ADVERSARIAL_STEP',
    'CODEX_SECOND_OPINION',
    'CODEX_PLAN_REVIEW',
    'REVIEW_ARMY',
  ],

  runtimeRoot: {
    globalSymlinks: ['bin', 'browse/dist', 'browse/bin', 'gstack-upgrade', 'ETHOS.md'],
    globalFiles: {
      'review': ['checklist.md', 'TODOS-format.md'],
    },
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  coAuthorTrailer: 'Co-Authored-By: Bob Agent <agent@ibm.com>',
  learningsMode: 'basic',
};

export default bob;
