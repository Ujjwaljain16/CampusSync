/**
 * What an approved recruiter may see about a student.
 *
 * ALWAYS visible (for approved students in the recruiter's organisation):
 *   name, university, graduation year, major, location, verified certificates
 *   (id, title, institution, date_issued only).
 * ONLY when the student set `recruiter_share_contact`:
 *   email, phone, linkedin, github, portfolio link, GPA.
 * NEVER returned: certificate file_url, description (raw OCR text),
 *   confidence_score, verification_method, non-verified certificates.
 */

import { getBaseUrl } from '@/lib/envValidator';
import { safeHttpUrl } from './safeUrl';
import type { StudentVisibility } from './visibility';

export interface RecruiterCertificate {
  id: string;
  title: string;
  institution: string | null;
  date_issued: string | null;
  verification_status: 'verified';
}

export interface RecruiterStudentView {
  id: string;
  name: string;
  university: string | null;
  graduation_year: number | null;
  major: string | null;
  location: string | null;
  contact_shared: boolean;
  gpa?: number | null;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  skills: string[];
  certifications: RecruiterCertificate[];
  verified_count: number;
  total_certifications: number;
  last_activity: string | null;
  created_at: string | null;
  portfolio_url: string | null;
}

export interface RawCertificateRow {
  id: string;
  title: string | null;
  institution: string | null;
  date_issued: string | null;
}

const SKILL_KEYWORDS: Array<[string, string]> = [
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['react', 'React'],
  ['node', 'Node.js'],
  ['machine learning', 'Machine Learning'],
  ['data science', 'Data Science'],
  ['web development', 'Web Development'],
  ['mobile', 'Mobile Development'],
  ['cloud', 'Cloud Computing'],
  ['aws', 'AWS'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['java ', 'Java'],
  ['cybersecurity', 'Cybersecurity'],
  ['blockchain', 'Blockchain'],
];

/** Skills inferred from certificate titles (simple keyword match, no external data). */
export function extractSkills(titles: Array<string | null | undefined>): string[] {
  const skills = new Set<string>();
  for (const raw of titles) {
    const title = `${(raw ?? '').toLowerCase()} `;
    for (const [needle, label] of SKILL_KEYWORDS) {
      if (title.includes(needle)) skills.add(label);
    }
  }
  return Array.from(skills);
}

function publicPortfolioUrl(studentId: string): string | null {
  try {
    return `${getBaseUrl()}/public/portfolio/${studentId}`;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Build the recruiter-safe representation of a student.
 * `profile` may be a raw `profiles` row (extra columns are ignored).
 */
export function buildRecruiterStudentView(
  profile: Record<string, unknown>,
  visibility: StudentVisibility,
  certificates: RawCertificateRow[]
): RecruiterStudentView {
  const id = String(profile.id);
  const certs: RecruiterCertificate[] = certificates.map((c) => ({
    id: c.id,
    title: c.title ?? 'Untitled certificate',
    institution: c.institution ?? null,
    date_issued: c.date_issued ?? null,
    verification_status: 'verified',
  }));

  const view: RecruiterStudentView = {
    id,
    name: str(profile.full_name) ?? str(profile.name) ?? 'Unknown Student',
    university: str(profile.university),
    graduation_year: num(profile.graduation_year),
    major: str(profile.major),
    location: str(profile.location),
    contact_shared: visibility.recruiterShareContact,
    skills: extractSkills(certs.map((c) => c.title)),
    certifications: certs,
    verified_count: certs.length,
    total_certifications: certs.length,
    last_activity: certs.find((c) => c.date_issued)?.date_issued ?? str(profile.created_at),
    created_at: str(profile.created_at),
    portfolio_url: visibility.publicPortfolioEnabled ? publicPortfolioUrl(id) : null,
  };

  if (visibility.recruiterShareContact) {
    view.gpa = num(profile.gpa);
    const email = str(profile.email);
    if (email) view.email = email;
    const phone = str(profile.phone);
    if (phone) view.phone = phone;
    const linkedin = safeHttpUrl(profile.linkedin);
    if (linkedin) view.linkedin = linkedin;
    const github = safeHttpUrl(profile.github);
    if (github) view.github = github;
    const portfolio = safeHttpUrl(profile.portfolio);
    if (portfolio) view.portfolio = portfolio;
  }

  return view;
}
