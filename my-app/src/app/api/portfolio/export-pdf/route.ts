import { NextRequest } from 'next/server';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { apiError } from '@/lib/api/utils/response';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { isUuid } from '@/lib/privacy/sanitize';
import { readJsonObject } from '@/lib/privacy/recruiterAccess';
import { getStudentVisibility } from '@/lib/privacy/visibility';
import { sanitizeForWinAnsi } from '@/lib/privacy/pdfText';
import { safeHttpUrl } from '@/lib/privacy/safeUrl';
import { recordPiiRead } from '@/lib/privacy/audit';
import { logger } from '@/lib/logger';

/**
 * Portfolio PDF export (POST { userId, includePersonalInfo? }).
 *
 * Who may export student X's verified-credential PDF:
 *  - X themself (must hold at least one approved role);
 *  - an APPROVED reviewer (faculty / admin / org_admin) of one of X's organisations,
 *    or an approved platform-level super_admin;
 *  - an APPROVED recruiter of one of X's organisations, ONLY if X enabled
 *    `recruiter_share_contact`.
 * The target's organisations are resolved from their approved student role rows
 * (no `.single()`); if they cannot be determined the request is denied.
 *
 * Personal info (email, phone, linkedin, github): default ON for the owner, default
 * OFF for everybody else (opt in with includePersonalInfo: true).
 * Certificates: verified only, scoped to the organisations the caller may access,
 * at most 100, title/institution/date only (no OCR description or confidence).
 */

const MAX_CERTIFICATES = 100;
const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'];
const PAGE: [number, number] = [595.28, 841.89];

type RoleRow = { role: string; organization_id: string | null; approval_status: string | null };
type CertRow = { id: string; title: string | null; institution: string | null; date_issued: string | null };

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    // break words that are wider than the line
    while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-GB', { timeZone: 'UTC' });
}

async function buildPdf(params: {
  profile: Record<string, unknown> | null;
  certificates: CertRow[];
  includePersonalInfo: boolean;
}): Promise<Uint8Array> {
  const { profile, certificates, includePersonalInfo } = params;
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primary = rgb(0.2, 0.4, 0.8);
  const secondary = rgb(0.4, 0.4, 0.4);
  const light = rgb(0.5, 0.5, 0.5);
  const left = 50;
  const contentWidth = PAGE[0] - 100;

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdfDoc.addPage(PAGE);
    pages.push(p);
    return p;
  };
  let page = newPage();
  let y = PAGE[1] - 70;

  const ensureSpace = (needed: number) => {
    if (y - needed < 80) {
      page = newPage();
      y = PAGE[1] - 70;
    }
  };
  const drawLines = (text: string, font: PDFFont, size: number, color: ReturnType<typeof rgb>, gap: number, maxLines = 6) => {
    const lines = wrapText(sanitizeForWinAnsi(text), font, size, contentWidth).slice(0, maxLines);
    for (const line of lines) {
      ensureSpace(size + gap);
      page.drawText(line, { x: left, y, size, font, color });
      y -= size + gap;
    }
  };

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const name = str(profile?.full_name) || str(profile?.name) || 'Student';
  drawLines(name, bold, 22, primary, 6, 2);

  const subtitle = [
    str(profile?.university),
    str(profile?.major) && `Major: ${str(profile?.major)}`,
    profile?.graduation_year ? `Class of ${String(profile.graduation_year)}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  if (subtitle) drawLines(subtitle, regular, 11, secondary, 4, 2);

  if (includePersonalInfo && profile) {
    const contact = [
      str(profile.email),
      str(profile.phone) && `Phone: ${str(profile.phone)}`,
      safeHttpUrl(profile.linkedin) && `LinkedIn: ${safeHttpUrl(profile.linkedin)}`,
      safeHttpUrl(profile.github) && `GitHub: ${safeHttpUrl(profile.github)}`,
    ]
      .filter(Boolean)
      .join(' | ');
    if (contact) drawLines(contact, regular, 9, light, 3, 3);
  }

  y -= 10;
  drawLines('Verified Academic Credentials', bold, 14, secondary, 6, 1);
  drawLines(`Generated on ${new Date().toISOString().slice(0, 10)}`, regular, 9, light, 4, 1);
  page.drawLine({ start: { x: left, y: y + 4 }, end: { x: PAGE[0] - 50, y: y + 4 }, thickness: 0.75, color: light });
  y -= 16;

  for (const cert of certificates) {
    ensureSpace(90);
    drawLines(cert.title || 'Untitled Certificate', bold, 14, primary, 4, 3);
    drawLines(cert.institution || 'Unknown Institution', regular, 11, secondary, 3, 2);
    drawLines(`Issued: ${formatDate(cert.date_issued)}`, regular, 10, light, 3, 1);
    drawLines('Status: Verified', regular, 10, rgb(0, 0.55, 0), 3, 1);
    y -= 10;
  }

  pages.forEach((p, index) => {
    p.drawText('Generated by CampusSync - Secure Academic Credential Verification', {
      x: left,
      y: 40,
      size: 8,
      font: regular,
      color: light,
    });
    p.drawText(`Page ${index + 1} of ${pages.length}  |  Certificates: ${certificates.length}`, {
      x: PAGE[0] - 220,
      y: 40,
      size: 8,
      font: regular,
      color: light,
    });
  });

  return pdfDoc.save();
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await readJsonObject(req);
    if (!parsed.ok) return parsed.response;
    const { userId, includePersonalInfo } = parsed.body;
    if (!isUuid(userId)) return apiError.badRequest('A valid userId is required');
    if (includePersonalInfo !== undefined && typeof includePersonalInfo !== 'boolean') {
      return apiError.badRequest('includePersonalInfo must be a boolean');
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return apiError.unauthorized('Authentication required');

    const limited = enforceRateLimit(req, 'portfolio-export-pdf', RateLimitPresets.standard, user.id);
    if (limited) return limited;

    // --- caller's approved roles ---
    const { data: callerRoleData, error: callerRoleError } = await supabase
      .from('user_roles')
      .select('role, organization_id, approval_status')
      .eq('user_id', user.id);
    if (callerRoleError) {
      logger.error('export-pdf: caller role lookup failed', callerRoleError);
      return apiError.internal('Unable to verify permissions');
    }
    const callerRoles = ((callerRoleData ?? []) as RoleRow[]).filter((r) => r.approval_status === 'approved');
    if (callerRoles.length === 0) return apiError.forbidden('Your account is not approved');

    // --- target's organisations (fail closed) ---
    const admin = await createSupabaseAdminClient();
    const { data: targetRoleData, error: targetRoleError } = await admin
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('role', 'student')
      .eq('approval_status', 'approved');
    if (targetRoleError) {
      logger.error('export-pdf: target role lookup failed', targetRoleError);
      return apiError.internal('Unable to verify permissions');
    }
    const targetOrgs = new Set(
      ((targetRoleData ?? []) as Array<{ organization_id: string | null }>)
        .map((r) => r.organization_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    if (targetOrgs.size === 0) return apiError.notFound('Student not found');

    // --- authorisation ---
    const isOwner = user.id === userId;
    let scopeOrgs: string[] = [];
    let isRecruiterAccess = false;

    if (isOwner) {
      scopeOrgs = Array.from(targetOrgs);
    } else {
      const reviewerOrgs = new Set<string>();
      for (const r of callerRoles) {
        if (!REVIEWER_ROLES.includes(r.role)) continue;
        if (r.organization_id) {
          if (targetOrgs.has(r.organization_id)) reviewerOrgs.add(r.organization_id);
        } else if (r.role === 'super_admin') {
          targetOrgs.forEach((o) => reviewerOrgs.add(o));
        }
      }

      const platformRecruiter = callerRoles.some((r) => r.role === 'recruiter' && r.organization_id === null);
      const recruiterOrgs = new Set<string>();
      if (platformRecruiter) {
        for (const r of callerRoles) {
          if (r.role === 'recruiter' && r.organization_id && targetOrgs.has(r.organization_id)) {
            recruiterOrgs.add(r.organization_id);
          }
        }
      }

      if (reviewerOrgs.size > 0) {
        scopeOrgs = Array.from(reviewerOrgs);
      } else if (recruiterOrgs.size > 0) {
        const visibility = await getStudentVisibility(admin, userId);
        if (!visibility.recruiterShareContact) {
          return apiError.forbidden('This student has not shared their profile with recruiters');
        }
        scopeOrgs = Array.from(recruiterOrgs);
        isRecruiterAccess = true;
      } else {
        return apiError.forbidden('You are not allowed to export this portfolio');
      }
    }

    const wantsPersonalInfo = isOwner ? includePersonalInfo !== false : includePersonalInfo === true;

    // --- data ---
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      logger.error('export-pdf: profile lookup failed', profileError);
      return apiError.internal('Failed to load student profile');
    }

    const { data: certData, error: certError } = await admin
      .from('certificates')
      .select('id, title, institution, date_issued')
      .eq('student_id', userId)
      .in('organization_id', scopeOrgs)
      .eq('verification_status', 'verified')
      .order('date_issued', { ascending: false })
      .limit(MAX_CERTIFICATES);
    if (certError) {
      logger.error('export-pdf: certificate lookup failed', certError);
      return apiError.internal('Failed to fetch certificates');
    }
    const certificates = (certData ?? []) as CertRow[];
    if (certificates.length === 0) return apiError.notFound('No verified certificates found');

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildPdf({
        profile: (profile as Record<string, unknown> | null) ?? null,
        certificates,
        includePersonalInfo: wantsPersonalInfo,
      });
    } catch (err) {
      logger.error('export-pdf: PDF generation failed', err);
      return apiError.internal('Failed to generate PDF');
    }

    if (!isOwner) {
      await recordPiiRead(admin, {
        userId: user.id,
        organizationId: scopeOrgs[0] ?? null,
        action: 'portfolio_pdf_export',
        targetId: userId,
        details: { include_personal_info: wantsPersonalInfo, as: isRecruiterAccess ? 'recruiter' : 'reviewer', certificate_count: certificates.length },
      });
    }

    return new Response(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="campussync-portfolio-${userId}.pdf"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error('Error in export-pdf route', err);
    return apiError.internal('Failed to generate PDF');
  }
}
