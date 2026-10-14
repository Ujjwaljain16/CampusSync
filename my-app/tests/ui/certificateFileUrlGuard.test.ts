// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The `certificates` bucket is private, so a stored storage URL is a dead link. The UI must never use
 * `file_url` (or the upload route's `publicUrl`) as an href / src / iframe / window.open target; files
 * are opened through CertificateFileLink, which asks the server for a signed URL.
 */
const ROOT = join(__dirname, '..', '..');
const DIRS = ['src/app', 'src/components'];
const NAMES = '(?:file_url|fileUrl|publicUrl)';

const FORBIDDEN: Array<[string, RegExp]> = [
  ['href=', new RegExp(`href=\\{[^}]*${NAMES}`)],
  ['src=', new RegExp(`\\bsrc=\\{[^}]*${NAMES}`)],
  ['<img/<iframe/<embed/<object', new RegExp(`<(?:img|iframe|embed|object|Image)\\b[^>]*${NAMES}`, 's')],
  ['window.open', new RegExp(`window\\.open\\([^)]*${NAMES}`)],
  ['location assignment', new RegExp(`location(?:\\.href)?\\s*=\\s*[^;]*${NAMES}`)],
];

function findViolations(source: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(source)).map(([name]) => name);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('UI never links to a storage URL', () => {
  it('detects the patterns it is meant to forbid', () => {
    expect(findViolations('<a href={cert.file_url} target="_blank">')).toContain('href=');
    expect(findViolations('<a href={row.file_url ?? "#"}>')).toContain('href=');
    expect(findViolations('<img alt="" src={c.file_url} />')).toContain('src=');
    expect(findViolations('<iframe title="x" src={publicUrl}></iframe>')).toContain('src=');
    expect(findViolations('<iframe\n title="x"\n data={r.file_url} />')).toContain('<img/<iframe/<embed/<object');
    expect(findViolations('window.open(cert.file_url, "_blank")')).toContain('window.open');
    expect(findViolations('window.location.href = cert.file_url;')).toContain('location assignment');
    expect(findViolations('{cert.file_url && <span>has file</span>}')).toEqual([]);
    expect(findViolations('<a href={signedUrl}>')).toEqual([]);
  });

  it('src/app and src/components do not use file_url / publicUrl as href, src, iframe or window.open', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const hits = findViolations(readFileSync(file, 'utf8'));
        if (hits.length) offenders.push(`${relative(ROOT, file)}: ${hits.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the pages that used to link file_url use CertificateFileLink', () => {
    for (const page of ['src/app/student/dashboard/page.tsx', 'src/app/faculty/dashboard/page.tsx', 'src/app/faculty/flagged/page.tsx']) {
      expect(readFileSync(join(ROOT, page), 'utf8')).toContain('<CertificateFileLink');
    }
  });
});
