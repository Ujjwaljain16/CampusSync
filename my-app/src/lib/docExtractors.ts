export type DocumentType = 'certificate'|'transcript'|'degree'|'letter'|'id'|'enrollment'|'syllabus'|'resume';

export interface ExtractedFields {
  name?: string;
  recipient?: string;
  degree?: string;
  gpa?: string;
  cgpa?: string;
  program?: string;
  issuer?: string;
  date_issued?: string;
  id_number?: string;
  mrz?: string[];
}

function extractByRegex(text: string, patterns: Array<[keyof ExtractedFields, RegExp]>): ExtractedFields {
  const out: ExtractedFields = {};
  for (const [k, rx] of patterns) {
    const m = text.match(rx);
    if (m && m[1]) (out as any)[k] = m[1].trim();
  }
  return out;
}

export function extractCertificate(text: string): ExtractedFields {
  return extractByRegex(text, [
    ['recipient', /(awarded to|presented to|recipient|this is to certify that)\s*[:\-]?\s*(.+)/i],
    ['issuer', /(issued by|institution|university|college|institute)\s*[:\-]?\s*(.+)/i],
    ['date_issued', /(date(?:\s*of)?(?:\s*issue)?)\s*[:\-]?\s*([0-9A-Za-z,\/\- ]{6,})/i],
    ['degree', /(bachelor|master|doctor|phd|associate|diploma|certificate)\s+(?:of|in)\s+(.+)/i],
    ['id_number', /(?:student|id)\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]{4,})/i],
  ]);
}

export function extractTranscript(text: string): ExtractedFields {
  const fields = extractByRegex(text, [
    ['name', /(name|student)\s*[:\-]?\s*([A-Za-z ,.']{3,})/i],
    ['gpa', /(gpa|cgpa|grade point average)\s*[:\-]?\s*([0-9]\.?[0-9]{0,2})/i],
    ['issuer', /(university|institute|college|school)\s*[:\-]?\s*([A-Za-z &,.]{3,})/i],
    ['program', /(major|program|field|concentration)\s*[:\-]?\s*([A-Za-z &,.]{3,})/i],
    ['id_number', /(?:student|id)\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]{4,})/i],
  ]);
  if (!fields.cgpa && fields.gpa) fields.cgpa = fields.gpa;
  return fields;
}

export function extractLetter(text: string): ExtractedFields {
  return extractByRegex(text, [
    ['issuer', /(from|issuer|department|university|college|institute)\s*[:\-]?\s*([A-Za-z &,.]{3,})/i],
    ['date_issued', /(date|issued|written)\s*[:\-]?\s*([0-9A-Za-z,\/\- ]{6,})/i],
    ['recipient', /(to|dear|addressed to)\s*[:\-]?\s*([A-Za-z ,.']{3,})/i],
    ['name', /(student|applicant|candidate)\s*[:\-]?\s*([A-Za-z ,.']{3,})/i],
  ]);
}

export function extractId(text: string, mrzLines?: string[]): ExtractedFields {
  const base = extractByRegex(text, [
    ['name', /(name|full name|student name)\s*[:\-]?\s*([A-Za-z ,.']{3,})/i],
    ['id_number', /(id|document|student|card)\s*(no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]{4,})/i],
    ['date_issued', /(expiry|valid until|validity|issued|expires)\s*[:\-]?\s*([0-9A-Za-z,\/\- ]{6,})/i],
    ['issuer', /(issued by|institution|university|college)\s*[:\-]?\s*([A-Za-z &,.]{3,})/i],
  ]);
  if (mrzLines && mrzLines.length) base.mrz = mrzLines;
  return base;
}

  // Removed the old extractByType function with mrzLines
export function extractByType(
  text: string,
  type: DocumentType
): Record<string, string | string[] | undefined> {
  let fields: ExtractedFields = {};
  return { ...fields };
}


