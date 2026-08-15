// Programmatic API. Use this when you want the same verdict the CLI produces,
// from inside your own script or CI job, without shelling out and parsing text.
//
//   import { loadConfig, loadProject, auditProject, evaluateGates } from 'adp';
//   const gates = evaluateGates(auditProject(loadProject(loadConfig(process.cwd()))).findings);
//   process.exitCode = gates.exitCode;   // 0 clean, 1..7 = the failing gate

export { DEFAULT_CONFIG, loadConfig } from './config.js';
export { loadProject } from './core/project.js';
export { auditProject } from './core/audit.js';
export { checkPrinciples } from './core/principles.js';
export {
  GATES,
  LABELS,
  CI_ESCALATES,
  gateOf,
  label,
  allMappedCodes,
  evaluateGates,
} from './core/gates.js';
export { renderTerminal, renderJson, renderGates, renderPrompt } from './core/report.js';
export {
  initProject,
  newFeature,
  detectAgent,
  renderReport,
  AGENT_SKILL_DIRS,
  PACKAGE_DIR,
} from './core/init.js';
export { parsePrd, SPEC_STATUSES } from './parsers/prd.js';
export { parseRfc } from './parsers/rfc.js';
export { parseSpec, allAcs, TASK_STATUSES, ASM_STATUSES, Q_STATUSES } from './parsers/spec.js';
export { parseDesign } from './parsers/design.js';
export { parseConstitution } from './parsers/constitution.js';
export { scanAnnotations, grepPattern } from './parsers/annotations.js';
export { walkFiles, globToRegExp } from './util/glob.js';
export { run as runCli } from './cli.js';
