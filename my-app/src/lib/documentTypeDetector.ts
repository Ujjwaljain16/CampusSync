/**
 * Universal Document Type Detector
 * Automatically identifies any type of document based on content analysis
 */

export interface DocumentTypeInfo {
  type: string;
  confidence: number;
  characteristics: string[];
  extraction_hints: string[];
}

export class DocumentTypeDetector {
  private documentTypes = [
    {
      name: 'certificate',
      keywords: ['certificate', 'completion', 'awarded', 'presented', 'certify', 'achievement'],
      patterns: [
        /certificate\s+of\s+/i,
        /this\s+is\s+to\s+certify/i,
        /awarded\s+to/i,
        /successful\s+completion/i
      ],
      confidence_boost: 0.3
    },
    {
      name: 'diploma',
      keywords: ['diploma', 'degree', 'graduation', 'bachelor', 'master', 'phd', 'doctorate'],
      patterns: [
        /diploma\s+in/i,
        /degree\s+of/i,
        /bachelor\s+of/i,
        /master\s+of/i,
        /doctor\s+of/i
      ],
      confidence_boost: 0.3
    },
    {
      name: 'transcript',
      keywords: ['transcript', 'grades', 'gpa', 'semester', 'course', 'credit', 'marks'],
      patterns: [
        /transcript\s+of/i,
        /grade\s+point\s+average/i,
        /semester\s+\d+/i,
        /credit\s+hours/i
      ],
      confidence_boost: 0.3
    },
    {
      name: 'award',
      keywords: ['award', 'recognition', 'honor', 'excellence', 'outstanding', 'achievement'],
      patterns: [
        /award\s+for/i,
        /recognition\s+of/i,
        /outstanding\s+achievement/i,
        /excellence\s+in/i
      ],
      confidence_boost: 0.3
    },
    {
      name: 'license',
      keywords: ['license', 'licensed', 'permit', 'authorization', 'credential', 'certification'],
      patterns: [
        /license\s+number/i,
        /licensed\s+to/i,
        /authorization\s+to/i,
        /credential\s+number/i
      ],
      confidence_boost: 0.3
    },
    {
      name: 'workshop_certificate',
      keywords: ['workshop', 'training', 'seminar', 'course', 'program', 'attended'],
      patterns: [
        /workshop\s+on/i,
        /training\s+program/i,
        /seminar\s+on/i,
        /attended\s+the/i
      ],
      confidence_boost: 0.2
    },
    {
      name: 'internship_certificate',
      keywords: ['internship', 'intern', 'practical', 'experience', 'training', 'placement'],
      patterns: [
        /internship\s+program/i,
        /practical\s+training/i,
        /work\s+experience/i,
        /placement\s+program/i
      ],
      confidence_boost: 0.2
    },
    {
      name: 'conference_certificate',
      keywords: ['conference', 'symposium', 'convention', 'meeting', 'presentation', 'speaker'],
      patterns: [
        /conference\s+on/i,
        /symposium\s+on/i,
        /presented\s+at/i,
        /speaker\s+at/i
      ],
      confidence_boost: 0.2
    },
    {
      name: 'research_certificate',
      keywords: ['research', 'study', 'investigation', 'analysis', 'findings', 'publication'],
      patterns: [
        /research\s+project/i,
        /study\s+on/i,
        /investigation\s+of/i,
        /research\s+work/i
      ],
      confidence_boost: 0.2
    },
    {
      name: 'volunteer_certificate',
      keywords: ['volunteer', 'service', 'community', 'charity', 'helping', 'contribution'],
      patterns: [
        /volunteer\s+service/i,
        /community\s+service/i,
        /charity\s+work/i,
        /volunteered\s+for/i
      ],
      confidence_boost: 0.2
    }
  ];

  /**
   * Detect document type from text content
   */
  public detectDocumentType(text: string): DocumentTypeInfo {
    const textLower = text.toLowerCase();
    let bestMatch: DocumentTypeInfo = { type: 'unknown', confidence: 0, characteristics: [], extraction_hints: [] };
    
    console.log(`🔍 Detecting document type from ${text.length} characters...`);

    for (const docType of this.documentTypes) {
      let confidence = 0;
      const characteristics: string[] = [];
      const extractionHints: string[] = [];

      // Check keywords
      const keywordMatches = docType.keywords.filter(keyword => 
        textLower.includes(keyword.toLowerCase())
      );
      
      if (keywordMatches.length > 0) {
        confidence += keywordMatches.length * 0.1;
        characteristics.push(`Contains keywords: ${keywordMatches.join(', ')}`);
      }

      // Check patterns
      const patternMatches = docType.patterns.filter(pattern => 
        pattern.test(text)
      );
      
      if (patternMatches.length > 0) {
        confidence += patternMatches.length * 0.15;
        characteristics.push(`Matches patterns: ${patternMatches.length} found`);
      }

      // Apply confidence boost
      confidence += docType.confidence_boost;

      // Add extraction hints based on document type
      switch (docType.name) {
        case 'certificate':
          extractionHints.push('Look for title, institution, recipient, date');
          extractionHints.push('Check for verification URL or QR code');
          break;
        case 'diploma':
          extractionHints.push('Extract degree name, university, graduation date');
          extractionHints.push('Look for degree level (Bachelor, Master, PhD)');
          break;
        case 'transcript':
          extractionHints.push('Extract GPA, semester, course grades');
          extractionHints.push('Look for academic year and institution');
          break;
        case 'award':
          extractionHints.push('Extract award name, recipient, date, reason');
          extractionHints.push('Look for awarding organization');
          break;
        case 'license':
          extractionHints.push('Extract license number, issuing authority, expiry date');
          extractionHints.push('Look for license type and validity period');
          break;
        case 'workshop_certificate':
          extractionHints.push('Extract workshop name, duration, instructor');
          extractionHints.push('Look for completion date and organization');
          break;
        case 'internship_certificate':
          extractionHints.push('Extract company name, duration, supervisor');
          extractionHints.push('Look for internship period and achievements');
          break;
        case 'conference_certificate':
          extractionHints.push('Extract conference name, date, location');
          extractionHints.push('Look for presentation title and organizers');
          break;
        case 'research_certificate':
          extractionHints.push('Extract research title, supervisor, duration');
          extractionHints.push('Look for research area and outcomes');
          break;
        case 'volunteer_certificate':
          extractionHints.push('Extract organization, service type, duration');
          extractionHints.push('Look for volunteer hours and impact');
          break;
      }

      // Update best match if this is better
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: docType.name,
          confidence: Math.min(1, confidence),
          characteristics,
          extraction_hints: extractionHints
        };
      }
    }

    // If no specific type detected, try to infer from content
    if (bestMatch.confidence < 0.3) {
      bestMatch = this.inferDocumentType(text);
    }

    console.log(`✅ Detected document type: ${bestMatch.type} (confidence: ${bestMatch.confidence.toFixed(2)})`);
    
    return bestMatch;
  }

  /**
   * Infer document type from content when no specific patterns match
   */
  private inferDocumentType(text: string): DocumentTypeInfo {
    const textLower = text.toLowerCase();
    
    // Check for academic content
    if (textLower.includes('university') || textLower.includes('college') || textLower.includes('institute')) {
      if (textLower.includes('grade') || textLower.includes('gpa') || textLower.includes('semester')) {
        return {
          type: 'transcript',
          confidence: 0.4,
          characteristics: ['Contains academic institution and grade information'],
          extraction_hints: ['Extract grades, GPA, semester information', 'Look for course names and credits']
        };
      } else if (textLower.includes('degree') || textLower.includes('bachelor') || textLower.includes('master')) {
        return {
          type: 'diploma',
          confidence: 0.4,
          characteristics: ['Contains degree-related information'],
          extraction_hints: ['Extract degree name, university, graduation date', 'Look for degree level']
        };
      } else {
        return {
          type: 'certificate',
          confidence: 0.3,
          characteristics: ['Contains institutional information'],
          extraction_hints: ['Extract title, institution, recipient, date', 'Look for completion or achievement information']
        };
      }
    }

    // Check for professional content
    if (textLower.includes('company') || textLower.includes('corporation') || textLower.includes('organization')) {
      return {
        type: 'certificate',
        confidence: 0.3,
        characteristics: ['Contains organizational information'],
        extraction_hints: ['Extract organization name, recipient, achievement', 'Look for completion or recognition information']
      };
    }

    // Default to certificate if it looks like a document
    if (text.length > 50 && (textLower.includes('certificate') || textLower.includes('award') || textLower.includes('completion'))) {
      return {
        type: 'certificate',
        confidence: 0.2,
        characteristics: ['Generic document with certificate-like content'],
        extraction_hints: ['Extract any available information', 'Look for title, recipient, date, issuer']
      };
    }

    // Unknown document type
    return {
      type: 'unknown',
      confidence: 0.1,
      characteristics: ['No clear document type patterns detected'],
      extraction_hints: ['Try generic extraction', 'Look for any structured information']
    };
  }

  /**
   * Get extraction strategy recommendations based on document type
   */
  public getExtractionStrategy(documentType: string): string[] {
    const strategies: { [key: string]: string[] } = {
      'certificate': [
        'Use pattern-based extraction for title and institution',
        'Look for recipient in "awarded to" patterns',
        'Extract dates from various date formats',
        'Check for verification URLs or QR codes'
      ],
      'diploma': [
        'Extract degree name and level',
        'Look for university and graduation date',
        'Check for academic year information',
        'Extract any honors or distinctions'
      ],
      'transcript': [
        'Focus on grade and GPA extraction',
        'Look for semester and course information',
        'Extract academic year and institution',
        'Check for credit hours and grades'
      ],
      'award': [
        'Extract award name and recipient',
        'Look for awarding organization',
        'Extract date and reason for award',
        'Check for any monetary value or recognition level'
      ],
      'license': [
        'Extract license number and type',
        'Look for issuing authority',
        'Extract expiry date and validity period',
        'Check for any restrictions or conditions'
      ],
      'workshop_certificate': [
        'Extract workshop name and duration',
        'Look for instructor and organization',
        'Extract completion date',
        'Check for any skills or topics covered'
      ],
      'internship_certificate': [
        'Extract company name and duration',
        'Look for supervisor and department',
        'Extract internship period and achievements',
        'Check for any skills gained or projects completed'
      ],
      'conference_certificate': [
        'Extract conference name and date',
        'Look for location and organizers',
        'Extract presentation title if applicable',
        'Check for any speaker or participant information'
      ],
      'research_certificate': [
        'Extract research title and area',
        'Look for supervisor and institution',
        'Extract research period and outcomes',
        'Check for any publications or presentations'
      ],
      'volunteer_certificate': [
        'Extract organization and service type',
        'Look for volunteer hours and duration',
        'Extract impact or contribution made',
        'Check for any recognition or appreciation'
      ]
    };

    return strategies[documentType] || [
      'Use generic extraction patterns',
      'Look for any structured information',
      'Extract common fields like title, recipient, date',
      'Check for any institutional or organizational information'
    ];
  }
}

/**
 * Main export function for easy use
 */
export function detectDocumentType(text: string): DocumentTypeInfo {
  const detector = new DocumentTypeDetector();
  return detector.detectDocumentType(text);
}
