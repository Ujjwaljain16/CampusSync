// Copies the canonical offline verifier (repo-root verifier/src) into the app so the /verify page
// can bundle it. Next resolves `jose` from my-app/node_modules, which it cannot do for files
// outside the app directory. tests/verifier/vendoredCopy.test.ts fails when the copies drift.
//
//   node scripts/sync-verifier.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'verifier', 'src');
const to = join(here, '..', 'src', 'lib', 'offlineVerify');

mkdirSync(to, { recursive: true });
for (const f of ['verify.mjs', 'verify.d.mts']) {
	copyFileSync(join(from, f), join(to, f));
	console.log(`copied ${f}`);
}
