import { NextRequest } from 'next/server';
import { apiError, parseAndValidateBody, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '@/lib/logger';

interface ExportPdfBody {
  userId: string;
  includePersonalInfo?: boolean;
}

interface Certificate {
  id: string;
  title: string;
  institution: string;
  date_issued: string | null;
  description: string | null;
  verification_status: string;
  file_url: string | null;
  created_at: string;
}

interface CertificateMetadata {
  certificate_id: string;
  ai_confidence_score: number | null;
  verification_details: unknown;
}

interface TargetProfile {
  id: string;
  full_name: string | null;
  name: string | null;
  email: string;
  university: string | null;
  major: string | null;
  graduation_year: string | null;
  location: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  created_at: string;
}

export async function POST(req: NextRequest) {
  try {
    const result = await parseAndValidateBody<ExportPdfBody>(req, ['userId']);
    if (result.error) return result.error;

    const body = result.data;

    const userWithRole = await getServerUserWithRole();
    if (!userWithRole) throw apiError.unauthorized();

    const { user } = userWithRole;

    const supabase = await createSupabaseServerClient();
    const orgContext = await getOrganizationContext(user);
    const targetOrgIds = getTargetOrganizationIds(orgContext);

    // Verify target user belongs to same organization (unless super admin)
    if (!orgContext.isSuperAdmin) {
      const { data: targetUserOrg } = await supabase
        .from('user_roles')
        .select('organization_id')
        .eq('user_id', body.userId)
        .single();

      if (targetUserOrg && targetUserOrg.organization_id !== ('organizationId' in orgContext ? orgContext.organizationId : null)) {
        throw apiError.forbidden('Cannot export portfolio for user in different organization');
      }
    }

    // Get user's certificates (org-filtered)
    let certQuery = supabase
      .from('certificates')
      .select(`
        id,
        title,
        institution,
        date_issued,
        description,
        verification_status,
        file_url,
        created_at
      `)
  .eq('student_id', body.userId)
      .eq('verification_status', 'verified')
      .order('date_issued', { ascending: false });

    if (!orgContext.isSuperAdmin) {
      certQuery = certQuery.in('organization_id', targetOrgIds);
    }

    const { data: certificates, error: certError } = await certQuery;

    if (certError) {
      logger.error('Failed to fetch certificates', certError);
      throw apiError.internal('Failed to fetch certificates');
    }

    if (!certificates || certificates.length === 0) {
      throw apiError.notFound('No verified certificates found');
    }

    // Get verification metadata for confidence scores
    const certificateIds = certificates.map((c: Certificate) => c.id);
    const { data: metadata, error: metaError } = await supabase
      .from('certificate_metadata')
      .select('certificate_id, ai_confidence_score, verification_details')
      .in('certificate_id', certificateIds);

    if (metaError) {
      logger.warn('Failed to fetch metadata', { error: metaError });
    }

    // Fetch target user's profile to include in the PDF header (best-effort)
    const { data: targetProfile, error: profileFetchError } = await supabase
      .from('profiles')
      .select('id, full_name, name, email, university, major, graduation_year, location, phone, linkedin, github, portfolio, created_at')
      .eq('id', body.userId)
      .single() as { data: TargetProfile | null; error: unknown };

    if (profileFetchError) {
      logger.warn('Failed to fetch target profile (export)', { error: profileFetchError });
    }

    // Derive a simple skills list from certificate titles (fallback)
    const skillsSet = new Set<string>();
    (certificates || []).forEach((cert: Certificate) => {
      const title = (cert?.title || '').toLowerCase();
      const tokens = title.split(/[^a-z0-9.#+]+/i).filter(Boolean);
      tokens.forEach((t: string) => {
        if (t.length > 2 && t.length < 25) skillsSet.add(t);
      });
    });
    const skills = Array.from(skillsSet).slice(0, 12);

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();

    // Add fonts
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const headerFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const smallFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Colors
    const primaryColor = rgb(0.2, 0.4, 0.8);
    const secondaryColor = rgb(0.4, 0.4, 0.4);
    const lightColor = rgb(0.6, 0.6, 0.6);

    // Page layout constants
    const leftMargin = 50;
    const rightMargin = width - 50;
    const contentWidth = rightMargin - leftMargin;

    // Header: profile + meta
    const profileName = targetProfile?.full_name || targetProfile?.name || 'Unnamed Student';
    const profileEmail = targetProfile?.email || '';
    const profileUniversity = targetProfile?.university || '';
    const profileMajor = targetProfile?.major || '';
    const profileGraduation = targetProfile?.graduation_year || '';

    // Title (name)
    page.drawText(profileName, {
      x: leftMargin,
      y: height - 70,
      size: 22,
      font: titleFont,
      color: primaryColor,
    });

    // Subtitle: university / major / grad year
    const subtitle = [profileUniversity, profileMajor && `Major: ${profileMajor}`, profileGraduation && `Class of ${profileGraduation}`].filter(Boolean).join(' • ');
    if (subtitle) {
      page.drawText(subtitle, {
        x: leftMargin,
        y: height - 95,
        size: 11,
        font: bodyFont,
        color: secondaryColor,
      });
    }

    // Contact row
    const contactRow = [profileEmail, targetProfile?.linkedin ? `LinkedIn: ${targetProfile.linkedin}` : null, targetProfile?.github ? `GitHub: ${targetProfile.github}` : null].filter(Boolean).join(' | ');
    if (contactRow) {
      page.drawText(contactRow, {
        x: leftMargin,
        y: height - 112,
        size: 9,
        font: smallFont,
        color: lightColor,
      });
    }

    // Skills chip line
    if (skills.length) {
      const skillsLine = 'Skills: ' + skills.join(', ');
      page.drawText(skillsLine, {
        x: leftMargin,
        y: height - 130,
        size: 9,
        font: smallFont,
        color: lightColor,
        maxWidth: contentWidth,
      });
    }

    // Section header for credentials
    page.drawText('Verified Academic Credentials', {
      x: leftMargin,
      y: height - 160,
      size: 14,
      font: headerFont,
      color: secondaryColor,
    });

    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: width - 200,
      y: height - 160,
      size: 9,
      font: smallFont,
      color: lightColor,
    });

    // Draw line separator under header
    page.drawLine({ start: { x: leftMargin, y: height - 170 }, end: { x: rightMargin, y: height - 170 }, thickness: 0.75, color: lightColor });

    // Start content below header
    let currentY = height - 190;

    (certificates || []).forEach((cert: Certificate, index: number) => {
      // Check if we need a new page
      if (currentY < 150) {
        page = pdfDoc.addPage([595.28, 841.89]);
        // reset positions on new page
        currentY = height - 80;
      }

      // Certificate title
      page.drawText(cert.title || 'Untitled Certificate', {
        x: leftMargin,
        y: currentY,
        size: 16,
        font: headerFont,
        color: primaryColor,
        maxWidth: contentWidth,
      });

      currentY -= 22;

      // Institution
      page.drawText(cert.institution || 'Unknown Institution', {
        x: leftMargin,
        y: currentY,
        size: 11,
        font: bodyFont,
        color: secondaryColor,
        maxWidth: contentWidth,
      });

      currentY -= 18;

      // Date issued
      const dateText = cert.date_issued ? `Issued: ${new Date(cert.date_issued).toLocaleDateString()}` : 'Issued: N/A';
      page.drawText(dateText, {
        x: leftMargin,
        y: currentY,
        size: 10,
        font: smallFont,
        color: lightColor,
      });

      currentY -= 14;

      // Description if available
      if (cert.description) {
        const description = cert.description.length > 280 ? cert.description.substring(0, 280) + '...' : cert.description;
        page.drawText(description, {
          x: leftMargin,
          y: currentY,
          size: 10,
          font: smallFont,
          color: lightColor,
          maxWidth: contentWidth,
        });
        currentY -= 28;
      }

      // Verification status and confidence score
      const certMetadata = metadata?.find((m: CertificateMetadata) => m.certificate_id === cert.id);
      const confidenceScore = certMetadata?.ai_confidence_score || 0;
      page.drawText(`Verification: Verified (${Math.round(confidenceScore * 100)}% confidence)`, {
        x: leftMargin,
        y: currentY,
        size: 10,
        font: smallFont,
        color: rgb(0, 0.6, 0), // Green color for verified
      });

      currentY -= 20;

      // Separator
      if (index < certificates.length - 1) {
        page.drawLine({ start: { x: leftMargin, y: currentY + 8 }, end: { x: rightMargin, y: currentY + 8 }, thickness: 0.5, color: lightColor });
        currentY -= 12;
      }
    });

    // Add footer
    const footerY = 50;
    page.drawText('This portfolio was generated by CampusSync - Secure Academic Credential Verification', {
      x: leftMargin,
      y: footerY,
      size: 8,
      font: smallFont,
      color: lightColor,
    });

    page.drawText(`Total Certificates: ${certificates.length}`, {
      x: rightMargin - 100,
      y: footerY,
      size: 8,
      font: smallFont,
      color: lightColor,
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Return PDF as response using raw bytes (Uint8Array) so it works in Node/Edge
    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="campusync-portfolio-${body.userId}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error in export-pdf route', err);
    return apiError.internal(`Failed to generate PDF: ${message}`);
  }
}



