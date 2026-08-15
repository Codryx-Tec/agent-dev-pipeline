// Package-relative paths, pulled out of init.js so install-map.js can import
// them without init.js and install-map.js importing each other.

import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = path.resolve(HERE, '..', '..');
export const PAYLOAD_DIR = path.join(PACKAGE_DIR, 'payload');
export const TEMPLATES_DIR = path.join(PAYLOAD_DIR, 'templates');

// Where each agent harness looks for skills.
//
// Note the plural. Claude Code reads `.claude/skills/`, never `.claude/skill/` —
// a singular directory looks right, is easy to create by hand, and is silently
// never loaded. The installer always writes the plural form.
export const AGENT_SKILL_DIRS = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  antigravity: '.agents/skills',
  cursor: '.cursor/skills',
};

// Project-relative, inside config.specDir. Shared by init.js (writer) and
// upgrade.js (reader) so neither has to import the other for one string.
export const LOCKFILE_NAME = '.adp-install.json';
