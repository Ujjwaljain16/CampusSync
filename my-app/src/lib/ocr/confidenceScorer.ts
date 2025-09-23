// Confidence Scoring System for OCR Results
import { AdvancedOCRResult } from '../advancedOCR';
import { ExtractedFields } from './llmExtractor';

export class ConfidenceScorer {
  private trustedIssuers = [
    'coursera', 'edx', 'udemy', 'google', 'microsoft', 'amazon', 'ibm',
    'stanford', 'mit', 'harvard', 'iit', 'university', 'college', 'institute'
  ];

  scoreResult(fields: ExtractedFields, method: string): AdvancedOCRResult {
    let confidence = 0;
    let factors: string[] = [];

    // Base confidence by extraction method
    const methodScores = {
      'pdf_text': 0.9,
      'google_vision': 0.8,
      'paddle_ocr': 0.7,
      'llm_fallback': 0.5
    };
    confidence += methodScores[method as keyof typeof methodScores] || 0.3;
    factors.push(`Method: ${method}`);

    // Field completeness scoring
    const requiredFields = ['title', 'institution', 'recipient', 'date_issued'];
    const completedFields = requiredFields.filter(field => 
      fields[field as keyof ExtractedFields] && 
      (fields[field as keyof ExtractedFields] as string).length > 0
    );
    
    const completeness = completedFields.length / requiredFields.length;
    confidence += completeness * 0.3;
    factors.push(`Completeness: ${Math.round(completeness * 100)}%`);

    // Institution validation
    if (fields.institution) {
      const isKnownIssuer = this.trustedIssuers.some(issuer => 
        fields.institution!.toLowerCase().includes(issuer)
      );
      if (isKnownIssuer) {
        confidence += 0.2;
        factors.push('Known issuer');
      }
    }

    // Date validation
    if (fields.date_issued) {
      if (this.isValidDate(fields.date_issued)) {
        confidence += 0.1;
        factors.push('Valid date');
      } else {
        confidence -= 0.1;
        factors.push('Invalid date format');
      }
    }

    // Name validation (proper capitalization, reasonable length)
    if (fields.recipient) {
      if (this.isValidPersonName(fields.recipient)) {
        confidence += 0.1;
        factors.push('Valid recipient name');
      }
    }

    // Title validation (not too short/long, contains relevant keywords)
    if (fields.title) {
      if (this.isValidTitle(fields.title)) {
        confidence += 0.1;
        factors.push('Valid title');
      }
    }

    // Normalize confidence to 0-1 range
    confidence = Math.min(Math.max(confidence, 0), 1);

    return {
      title: fields.title || '',
      institution: fields.institution || '',
      recipient: fields.recipient || '',
      date_issued: fields.date_issued || '',
      certificate_id: fields.certificate_id,
      confidence_score: confidence,
      extraction_method: method as any,
      requires_review: confidence < 0.7
    };
  }

  isHighConfidence(result: AdvancedOCRResult): boolean {
    return result.confidence_score >= 0.8;
  }

  private isValidDate(dateStr: string): boolean {
    // Check if it's in YYYY-MM-DD format and is a valid date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return false;

    const date = new Date(dateStr);
    const now = new Date();
    const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
    const oneYearFromNow = new Date(now.getFullYear() + 1, 11, 31);

    return date >= tenYearsAgo && date <= oneYearFromNow;
  }

  private isValidPersonName(name: string): boolean {
    // Should be 2-4 words, properly capitalized
    const words = name.trim().split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;

    return words.every(word => 
      word.length > 0 && 
      word[0] === word[0].toUpperCase() &&
      /^[A-Za-z]+$/.test(word)
    );
  }

  private isValidTitle(title: string): boolean {
    if (!title || title.length < 5 || title.length > 120) return false;

    // Should contain educational keywords
    const keywords = [
      'certificate', 'diploma', 'degree', 'course', 'program', 'training',
      'specialization', 'certification', 'workshop', 'bootcamp', 'internship'
    ];

    return keywords.some(keyword => 
      title.toLowerCase().includes(keyword)
    );
  }
}
