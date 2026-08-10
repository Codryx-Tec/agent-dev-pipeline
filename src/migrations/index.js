// The migrations registry — the chain `adp upgrade` walks between the
// version recorded in a project's lockfile and the version currently
// running. Append future migrations here, in order; nothing else needs to
// change to register one.

import * as migration_0_5_0 from './0.5.0.js';

export const MIGRATIONS = [migration_0_5_0];

// No semver dependency — this is a zero-dependency project, and every
// version here is a plain `x.y.z` triple, so a numeric per-segment compare is
// all chaining needs.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/**
 * Every registered migration strictly after `fromVersion` and up to and
 * including `toVersion`, in ascending order.
 */
export function pendingMigrations(fromVersion, toVersion) {
  return MIGRATIONS.filter(
    (m) => compareVersions(m.version, fromVersion) > 0 && compareVersions(m.version, toVersion) <= 0
  ).sort((a, b) => compareVersions(a.version, b.version));
}

export { compareVersions };
