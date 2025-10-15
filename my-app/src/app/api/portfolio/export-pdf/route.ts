import { NextRequest, NextResponse } from 'next/server';
import { apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface ExportPdfBody {
  userId: string;
  includePersonalInfo?: boolean;
}

export async function POST(req: NextRequest) {
  const result = await parseAndValidateBody<ExportPdfBody>(req, ['userId']);
  if (result.error) return result.error;
  
  const body = result.data;

  const supabase = await createSupabaseServerClient();

  // Get user's certificates
  const { data: certificates, error: certError } = await supabase
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
    .eq('user_id', body.userId)
    .eq('verification_status', 'verified')
    .order('date_issued', { ascending: false });

  if (certError) {
    throw apiError.internal('Failed to fetch certificates');
  }

  if (!certificates || certificates.length === 0) {
    throw apiError.notFound('No verified certificates found');
  }

    // Get verification metadata for confidence scores
    const certificateIds = certificates.map(c => c.id);
    const { data: metadata, error: metaError } = await supabase
      .from('certificate_metadata')
      .select('certificate_id, ai_confidence_score, verification_details')
      .in('certificate_id', certificateIds);

    if (metaError) {
      console.warn('Failed to fetch metadata:', metaError);
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
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

    // Header
    page.drawText('CampusSync Portfolio', {
      x: 50,
      y: height - 80,
      size: 24,
      font: titleFont,
      color: primaryColor,
    });

    page.drawText('Verified Academic Credentials', {
      x: 50,
      y: height - 110,
      size: 14,
      font: bodyFont,
      color: secondaryColor,
    });

    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: height - 130,
      size: 10,
      font: smallFont,
      color: lightColor,
    });

    // Draw line separator
    page.drawLine({
      start: { x: 50, y: height - 150 },
      end: { x: width - 50, y: height - 150 },
      thickness: 1,
      color: lightColor,
    });

    // Add certificates
    let currentY = height - 180;
    const leftMargin = 50;
    const rightMargin = width - 50;
    const contentWidth = rightMargin - leftMargin;

    certificates.forEach((cert, index) => {
      // Check if we need a new page
      if (currentY < 150) {
        pdfDoc.addPage([595.28, 841.89]);
        currentY = height - 80;
      }

      // Certificate title
      page.drawText(cert.title, {
        x: leftMargin,
        y: currentY,
        size: 16,
        font: headerFont,
        color: primaryColor,
        maxWidth: contentWidth,
      });

      currentY -= 25;

      // Institution
      page.drawText(cert.institution, {
        x: leftMargin,
        y: currentY,
        size: 12,
        font: bodyFont,
        color: secondaryColor,
        maxWidth: contentWidth,
      });

      currentY -= 20;

      // Date issued
      page.drawText(`Issued: ${new Date(cert.date_issued).toLocaleDateString()}`, {
        x: leftMargin,
        y: currentY,
        size: 10,
        font: smallFont,
        color: lightColor,
        maxWidth: contentWidth,
      });

      currentY -= 15;

      // Description if available
      if (cert.description) {
        const description = cert.description.length > 100 
          ? cert.description.substring(0, 100) + '...'
          : cert.description;
        
        page.drawText(description, {
          x: leftMargin,
          y: currentY,
          size: 10,
          font: smallFont,
          color: lightColor,
          maxWidth: contentWidth,
        });
        currentY -= 20;
      }

      // Verification status and confidence score
      const certMetadata = metadata?.find(m => m.certificate_id === cert.id);
      const confidenceScore = certMetadata?.ai_confidence_score || 0;
      
      page.drawText(`Verification: Verified (${Math.round(confidenceScore * 100)}% confidence)`, {
        x: leftMargin,
        y: currentY,
        size: 10,
        font: smallFont,
        color: rgb(0, 0.6, 0), // Green color for verified
        maxWidth: contentWidth,
      });

      currentY -= 30;

      // Draw separator line between certificates
      if (index < certificates.length - 1) {
        page.drawLine({
          start: { x: leftMargin, y: currentY + 10 },
          end: { x: rightMargin, y: currentY + 10 },
          thickness: 0.5,
          color: lightColor,
        });
        currentY -= 20;
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

  // Return PDF as response (NextResponse required for binary data)
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="campusync-portfolio-${body.userId}.pdf"`,
      'Content-Length': pdfBytes.length.toString(),
    },
  });
}

