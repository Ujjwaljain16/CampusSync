// LLM-powered field normalization with constraints
export interface NormalizationConstraints {
  dateFormats?: string[];
  nameFormats?: string[];
  degreeMapping?: Record<string, string>;
  institutionMapping?: Record<string, string>;
}

export interface NormalizedFields {
  name?: string;
  institution?: string;
  degree?: string;
  date?: string;
  gpa?: string;
  idNumber?: string;
  confidence: number;
  originalValues: Record<string, string>;
  normalizedValues: Record<string, string>;
}

export class LLMNormalizer {
  private constraints: NormalizationConstraints;

  constructor(constraints: NormalizationConstraints = {}) {
    this.constraints = {
      dateFormats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'Month DD, YYYY'],
      nameFormats: ['First Last', 'Last, First', 'First Middle Last'],
      degreeMapping: {
        'bachelor': 'Bachelor',
        'bachelors': 'Bachelor',
        'bsc': 'Bachelor of Science',
        'ba': 'Bachelor of Arts',
        'master': 'Master',
        'masters': 'Master',
        'msc': 'Master of Science',
        'ma': 'Master of Arts',
        'phd': 'PhD',
        'doctor': 'PhD',
        'doctorate': 'PhD'
      },
      institutionMapping: {},
      ...constraints
    };
  }

  async normalize(fields: Record<string, any>): Promise<NormalizedFields> {
    const originalValues = { ...fields };
    const normalizedValues: Record<string, string> = {};
    let confidence = 1.0;

    // Normalize name
    if (fields.name || fields.studentName || fields.recipient) {
      const name = fields.name || fields.studentName || fields.recipient;
      const normalized = await this.normalizeName(name);
      normalizedValues.name = normalized.value;
      confidence *= normalized.confidence;
    }

    // Normalize institution
    if (fields.institution || fields.issuer || fields.university) {
      const institution = fields.institution || fields.issuer || fields.university;
      const normalized = await this.normalizeInstitution(institution);
      normalizedValues.institution = normalized.value;
      confidence *= normalized.confidence;
    }

    // Normalize degree
    if (fields.degree || fields.program || fields.major) {
      const degree = fields.degree || fields.program || fields.major;
      const normalized = await this.normalizeDegree(degree);
      normalizedValues.degree = normalized.value;
      confidence *= normalized.confidence;
    }

    // Normalize date
    if (fields.date || fields.issueDate || fields.dateIssued) {
      const date = fields.date || fields.issueDate || fields.dateIssued;
      const normalized = await this.normalizeDate(date);
      normalizedValues.date = normalized.value;
      confidence *= normalized.confidence;
    }

    // Normalize GPA
    if (fields.gpa || fields.cgpa) {
      const gpa = fields.gpa || fields.cgpa;
      const normalized = await this.normalizeGPA(gpa);
      normalizedValues.gpa = normalized.value;
      confidence *= normalized.confidence;
    }

    // Normalize ID number
    if (fields.idNumber || fields.studentId || fields.id) {
      const idNumber = fields.idNumber || fields.studentId || fields.id;
      const normalized = await this.normalizeIdNumber(idNumber);
      normalizedValues.idNumber = normalized.value;
      confidence *= normalized.confidence;
    }

    return {
      name: normalizedValues.name,
      institution: normalizedValues.institution,
      degree: normalizedValues.degree,
      date: normalizedValues.date,
      gpa: normalizedValues.gpa,
      idNumber: normalizedValues.idNumber,
      confidence: Math.round(confidence * 100) / 100,
      originalValues,
      normalizedValues
    };
  }

  private async normalizeName(name: string): Promise<{ value: string; confidence: number }> {
    if (!name || typeof name !== 'string') {
      return { value: '', confidence: 0 };
    }

    // Basic name normalization
    const cleaned = name.trim().replace(/\s+/g, ' ');
    
    // Check if it's in "Last, First" format
    if (cleaned.includes(',')) {
      const parts = cleaned.split(',').map(p => p.trim());
      if (parts.length === 2) {
        return { value: `${parts[1]} ${parts[0]}`, confidence: 0.9 };
      }
    }

    // Check if it's in "First Last" format
    const words = cleaned.split(' ');
    if (words.length >= 2) {
      // Capitalize first letter of each word
      const normalized = words.map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
      return { value: normalized, confidence: 0.8 };
    }

    return { value: cleaned, confidence: 0.6 };
  }

  private async normalizeInstitution(institution: string): Promise<{ value: string; confidence: number }> {
    if (!institution || typeof institution !== 'string') {
      return { value: '', confidence: 0 };
    }

    const cleaned = institution.trim();
    
    // Check institution mapping
    const lower = cleaned.toLowerCase();
    for (const [key, value] of Object.entries(this.constraints.institutionMapping || {})) {
      if (lower.includes(key.toLowerCase())) {
        return { value, confidence: 0.9 };
      }
    }

    // Basic normalization
    const normalized = cleaned
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return { value: normalized, confidence: 0.7 };
  }

  private async normalizeDegree(degree: string): Promise<{ value: string; confidence: number }> {
    if (!degree || typeof degree !== 'string') {
      return { value: '', confidence: 0 };
    }

    const cleaned = degree.trim().toLowerCase();
    
    // Check degree mapping
    for (const [key, value] of Object.entries(this.constraints.degreeMapping || {})) {
      if (cleaned.includes(key)) {
        return { value, confidence: 0.9 };
      }
    }

    // Basic normalization
    const normalized = degree.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return { value: normalized, confidence: 0.6 };
  }

  private async normalizeDate(date: string): Promise<{ value: string; confidence: number }> {
    if (!date || typeof date !== 'string') {
      return { value: '', confidence: 0 };
    }

    const cleaned = date.trim();
    
    // Try to parse various date formats
    const dateFormats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
      /(\d{4})-(\d{1,2})-(\d{1,2})/,    // YYYY-MM-DD
      /(\d{1,2})-(\d{1,2})-(\d{4})/,    // MM-DD-YYYY or DD-MM-YYYY
      /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/  // Month DD, YYYY
    ];

    for (const format of dateFormats) {
      const match = cleaned.match(format);
      if (match) {
        try {
          let year, month, day;
          if (format === dateFormats[0] || format === dateFormats[2]) {
            // MM/DD/YYYY or DD/MM/YYYY - assume MM/DD/YYYY for now
            month = match[1].padStart(2, '0');
            day = match[2].padStart(2, '0');
            year = match[3];
          } else if (format === dateFormats[1]) {
            // YYYY-MM-DD
            year = match[1];
            month = match[2].padStart(2, '0');
            day = match[3].padStart(2, '0');
          } else if (format === dateFormats[3]) {
            // Month DD, YYYY
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                              'july', 'august', 'september', 'october', 'november', 'december'];
            const monthIndex = monthNames.indexOf(match[1].toLowerCase());
            if (monthIndex !== -1) {
              year = match[3];
              month = (monthIndex + 1).toString().padStart(2, '0');
              day = match[2].padStart(2, '0');
            } else {
              continue;
            }
          }

          if (year && month && day) {
            const normalized = `${year}-${month}-${day}`;
            const parsedDate = new Date(normalized);
            if (!isNaN(parsedDate.getTime())) {
              return { value: normalized, confidence: 0.9 };
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    return { value: cleaned, confidence: 0.3 };
  }

  private async normalizeGPA(gpa: string): Promise<{ value: string; confidence: number }> {
    if (!gpa || typeof gpa !== 'string') {
      return { value: '', confidence: 0 };
    }

    const cleaned = gpa.trim();
    
    // Extract numeric value
    const match = cleaned.match(/(\d+\.?\d*)/);
    if (match) {
      const value = parseFloat(match[1]);
      if (value >= 0 && value <= 4) {
        return { value: value.toFixed(2), confidence: 0.9 };
      } else if (value >= 0 && value <= 100) {
        // Convert percentage to 4.0 scale
        const normalized = (value / 100) * 4;
        return { value: normalized.toFixed(2), confidence: 0.8 };
      }
    }

    return { value: cleaned, confidence: 0.3 };
  }

  private async normalizeIdNumber(idNumber: string): Promise<{ value: string; confidence: number }> {
    if (!idNumber || typeof idNumber !== 'string') {
      return { value: '', confidence: 0 };
    }

    const cleaned = idNumber.trim().toUpperCase();
    
    // Remove common prefixes/suffixes
    const normalized = cleaned
      .replace(/^(ID|STUDENT|STU|NO|NUMBER|#)\s*/i, '')
      .replace(/\s*(ID|STUDENT|STU|NO|NUMBER|#)$/i, '')
      .replace(/[^A-Z0-9\-]/g, '');

    return { value: normalized, confidence: 0.8 };
  }
}

// Default normalizer instance
export const defaultNormalizer = new LLMNormalizer();
