// The single place that reads the package's own version. A version literal
// held twice drifts the moment one copy is bumped and the other forgotten —
// exactly the failure this tool exists to catch elsewhere, so it does not
// hold it twice itself.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = path.join(HERE, '..', 'package.json');

export const VERSION = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version;
