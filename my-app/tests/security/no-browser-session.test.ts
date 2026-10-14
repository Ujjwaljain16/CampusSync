// @vitest-environment node
/**
 * Regression guard: the session lives only in HttpOnly cookies set by the server, so no code may bring back a
 * browser Supabase client (it stores the session in document.cookie) or read cookies from script.
 * See docs/SESSION-COOKIES.md.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const posix = (p: string) => p.split(sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

// src/ is the app; my-app/lib is the legacy folder that "@/lib/*" falls back to.
const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'lib'))];
const rel = (f: string) => posix(relative(ROOT, f));
const read = (f: string) => readFileSync(f, 'utf8');

describe('no browser Supabase client', () => {
  it('finds source files (sanity check on the walk)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('the browser client modules are gone', () => {
    for (const f of ['src/lib/supabase/client.ts', 'src/lib/supabaseClient.ts', 'lib/supabaseClient.ts']) {
      expect(existsSync(join(ROOT, f)), `${f} must stay deleted`).toBe(false);
    }
  });

  it('nothing under src/ (or the legacy lib/) uses createBrowserClient', () => {
    const offenders = files.filter((f) => /\bcreateBrowserClient\b/.test(read(f))).map(rel);
    expect(offenders, `createBrowserClient found in:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('nothing imports the removed client modules (alias or relative path)', () => {
    const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*(?:lib\/supabaseClient|lib\/supabase\/client|supabase\/client|\/supabaseClient)['"]/;
    const offenders = files.filter((f) => IMPORT.test(read(f))).map(rel);
    expect(offenders, `imports of the browser client:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('@supabase/ssr is only imported by server-side code', () => {
    const offenders = files
      .filter((f) => /@supabase\/ssr/.test(read(f)))
      .filter((f) => /^\s*['"]use client['"]/m.test(read(f)))
      .map(rel);
    expect(offenders, `'use client' files importing @supabase/ssr:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it("client components never use the Supabase JS client or read cookies from script", () => {
    const client = files.filter((f) => /^\s*['"]use client['"]/m.test(read(f)));
    const bad = client.filter((f) => /from\s+['"]@supabase\/|document\.cookie/.test(read(f))).map(rel);
    expect(bad, `client files touching Supabase / cookies:\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  it('no realtime subscriptions from the browser', () => {
    const client = files.filter((f) => /^\s*['"]use client['"]/m.test(read(f)));
    const bad = client.filter((f) => /\.channel\(|postgres_changes|onAuthStateChange/.test(read(f))).map(rel);
    expect(bad, `client files with realtime / auth listeners:\n  ${bad.join('\n  ')}`).toEqual([]);
  });
});
