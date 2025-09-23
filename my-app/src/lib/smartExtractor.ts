// Smart Certificate Extractor - Universal approach for all certificate types
export interface SmartExtractionResult {
  title?: string;
  institution?: string;
  date_issued?: string;
  description?: string;
  raw_text?: string;
  confidence?: number;
  recipient?: string;
}

export function smartExtractFromText(text: string, confidence?: number): SmartExtractionResult {
  const extractor = new SmartExtractor(text);
  return {
    raw_text: text,
    confidence,
    title: extractor.extractTitle(),
    institution: extractor.extractInstitution(),
    date_issued: extractor.extractDate(),
    description: extractor.extractDescription(),
    recipient: extractor.extractRecipient(),
  };
}

class SmartExtractor {
  private text: string;
  private lines: string[];
  private cleanLines: string[];

  constructor(text: string) {
    this.text = text;
    this.lines = text.split('\n').map(l => l.trim());
    this.cleanLines = this.lines.filter(l => l.length > 2);
  }

  extractTitle(): string | undefined {
    const candidates: Array<{value: string, confidence: number}> = [];

    // Strategy 1: Look for quoted or emphasized titles
    this.findQuotedTitles(candidates);
    
    // Strategy 2: Look for course/program patterns
    this.findCourseTitles(candidates);
    
    // Strategy 3: Look for degree/certification patterns
    this.findDegreeTitles(candidates);
    
    // Strategy 4: Look for completion patterns
    this.findCompletionTitles(candidates);
    
    // Strategy 5: Look for standalone course names
    this.findStandaloneTitles(candidates);

    return this.selectBest(candidates);
  }

  extractInstitution(): string | undefined {
    const candidates: Array<{value: string, confidence: number}> = [];

    // Strategy 1: Look in header (first 3 lines)
    for (let i = 0; i < Math.min(3, this.cleanLines.length); i++) {
      const line = this.cleanLines[i];
      const inst = this.parseInstitution(line);
      if (inst) {
        candidates.push({value: inst, confidence: 0.9 - i * 0.1});
      }
    }

    // Strategy 2: Look for "from/by/at" patterns
    const contextPatterns = [
      /(?:from|by|at|issued\s+by)\s+([^,\n.]{5,80})/gi,
      /authorized\s+by\s+([^,\n.]{5,80})/gi,
      /offered\s+through\s+([^,\n.]{5,80})/gi
    ];

    for (const pattern of contextPatterns) {
      const matches = [...this.text.matchAll(pattern)];
      for (const match of matches) {
        const inst = this.parseInstitution(match[1]);
        if (inst) {
          candidates.push({value: inst, confidence: 0.7});
        }
      }
    }

    return this.selectBest(candidates);
  }

  extractRecipient(): string | undefined {
    const candidates: Array<{value: string, confidence: number}> = [];

    // Look for proper names (2-3 capitalized words)
    const namePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = [...this.text.matchAll(namePattern)];
    
    for (const match of matches) {
      const name = match[1];
      if (this.isValidPersonName(name)) {
        let confidence = 0.5;
        
        // Boost confidence if found in context
        const beforeText = this.text.substring(Math.max(0, match.index! - 50), match.index!);
        if (beforeText.match(/certif(?:y|ies)\s+that|present.*certificate\s+to|awarded\s+to/i)) {
          confidence += 0.4;
        }
        
        candidates.push({value: name, confidence});
      }
    }

    return this.selectBest(candidates);
  }

  extractDate(): string | undefined {
    const candidates: Array<{value: string, confidence: number}> = [];

    // Look for various date formats
    const datePatterns = [
      {pattern: /(\d{4}-\d{1,2}-\d{1,2})/g, confidence: 0.9},
      {pattern: /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/g, confidence: 0.8},
      {pattern: /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gi, confidence: 0.9},
      {pattern: /(\d{1,2}(?:st|nd|rd|th)\s+(?:day\s+of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})/gi, confidence: 0.9},
      {pattern: /((?:completed|issued|dated|awarded)\s+on[:\s]+[\d\w\s,/-]+)/gi, confidence: 0.7}
    ];

    for (const {pattern, confidence} of datePatterns) {
      const matches = [...this.text.matchAll(pattern)];
      for (const match of matches) {
        const normalized = this.normalizeDate(match[1]);
        if (normalized) {
          candidates.push({value: normalized, confidence});
        }
      }
    }

    return this.selectBest(candidates);
  }

  extractDescription(): string | undefined {
    // Find the longest meaningful line that's not a title/institution
    const meaningfulLines = this.cleanLines
      .filter(line => line.length > 20 && line.length < 200)
      .filter(line => !this.isInstitution(line))
      .filter(line => !this.isPersonName(line));
    
    if (meaningfulLines.length > 0) {
      return meaningfulLines.reduce((a, b) => a.length > b.length ? a : b);
    }
    
    return undefined;
  }

  private findQuotedTitles(candidates: Array<{value: string, confidence: number}>) {
    const patterns = [/"([^"]{5,80})"/g, /'([^']{5,80})'/g, /\*([^*]{5,80})\*/g];
    
    for (const pattern of patterns) {
      const matches = [...this.text.matchAll(pattern)];
      for (const match of matches) {
        const title = this.cleanTitle(match[1]);
        if (this.isValidTitle(title)) {
          candidates.push({value: title, confidence: 0.8});
        }
      }
    }
  }

  private findCourseTitles(candidates: Array<{value: string, confidence: number}>) {
    const patterns = [
      /(?:successfully\s+)?completed\s+(?:the\s+)?([^,\n.]{10,80})/gi,
      /(?:course|program|training|specialization)[:\s]+([^,\n.]{5,80})/gi,
      /certification\s+in\s+([^,\n.]{5,80})/gi
    ];

    for (const pattern of patterns) {
      const matches = [...this.text.matchAll(pattern)];
      for (const match of matches) {
        const title = this.cleanTitle(match[1]);
        if (this.isValidTitle(title)) {
          candidates.push({value: title, confidence: 0.7});
        }
      }
    }
  }

  private findDegreeTitles(candidates: Array<{value: string, confidence: number}>) {
    const degreePattern = /(Bachelor|Master|Doctor|PhD|Certificate|Diploma)\s+(?:of\s+)?(?:Science\s+)?(?:in\s+)?([^,\n.]{5,60})/gi;
    const matches = [...this.text.matchAll(degreePattern)];
    
    for (const match of matches) {
      const degree = match[1];
      const field = match[2];
      const title = `${degree} ${field}`.trim();
      
      candidates.push({value: this.cleanTitle(title), confidence: 0.9});
    }
  }

  private findCompletionTitles(candidates: Array<{value: string, confidence: number}>) {
    // Look for standalone lines that might be course titles
    for (const line of this.cleanLines) {
      if (line.length > 10 && line.length < 80) {
        // Skip common boilerplate
        if (line.match(/certificate|completion|hereby|given this day|university|institute/i)) continue;
        
        // Look for title-like content
        if (line.match(/[A-Z][a-z]+.*[A-Z][a-z]+/) || line.match(/\b(?:AI|ML|IT|UI|UX|API|SDK)\b/)) {
          if (this.isValidTitle(line)) {
            candidates.push({value: this.cleanTitle(line), confidence: 0.6});
          }
        }
      }
    }
  }

  private findStandaloneTitles(candidates: Array<{value: string, confidence: number}>) {
    // Look for lines that are likely course titles (proper case, reasonable length)
    for (const line of this.cleanLines) {
      if (line.length >= 15 && line.length <= 100) {
        const words = line.split(' ');
        const capitalizedWords = words.filter(w => w.match(/^[A-Z]/)).length;
        const ratio = capitalizedWords / words.length;
        
        if (ratio > 0.5 && ratio < 0.9) { // Not all caps, not all lowercase
          if (this.isValidTitle(line) && !this.isInstitution(line)) {
            candidates.push({value: this.cleanTitle(line), confidence: 0.5});
          }
        }
      }
    }
  }

  private parseInstitution(text: string): string | undefined {
    const cleaned = text.trim();
    
    // Must contain institution keywords
    if (!cleaned.match(/university|college|institute|school|academy|coursera|edx|udemy|google|microsoft|amazon|ibm|oracle|adobe|cisco|stanford|harvard|mit/i)) {
      return undefined;
    }
    
    // Skip obvious non-institutions
    if (cleaned.match(/the following|hereby present|given this day|certificate|completion/i)) {
      return undefined;
    }
    
    return this.cleanInstitution(cleaned);
  }

  private isValidPersonName(name: string): boolean {
    const words = name.split(' ');
    if (words.length < 2 || words.length > 4) return false;
    
    // Each word should be properly capitalized
    for (const word of words) {
      if (!word.match(/^[A-Z][a-z]+$/)) return false;
    }
    
    // Shouldn't contain institution/certificate words
    if (name.match(/certificate|university|institute|college|completion|achievement/i)) return false;
    
    return true;
  }

  private isValidTitle(title: string): boolean {
    if (!title || title.length < 5 || title.length > 120) return false;
    
    // Skip obvious non-titles
    const skipPhrases = [
      'the following', 'hereby present', 'given this day', 'certificate of',
      'this is to certify', 'under the seal', 'republic of'
    ];
    
    const lowerTitle = title.toLowerCase();
    for (const phrase of skipPhrases) {
      if (lowerTitle.includes(phrase)) return false;
    }
    
    return true;
  }

  private isInstitution(text: string): boolean {
    return !!text.match(/university|college|institute|school|academy|coursera|edx|google|microsoft/i);
  }

  private isPersonName(text: string): boolean {
    return text.split(' ').length <= 4 && text.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/);
  }

  private cleanTitle(title: string): string {
    return title.replace(/\s+/g, ' ').trim();
  }

  private cleanInstitution(inst: string): string {
    return inst.replace(/\s+/g, ' ').trim();
  }

  private normalizeDate(dateStr: string): string | null {
    // Simple date normalization - can be enhanced
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
    
    // Handle common formats
    const monthMap: {[key: string]: string} = {
      'january': '01', 'february': '02', 'march': '03', 'april': '04',
      'may': '05', 'june': '06', 'july': '07', 'august': '08',
      'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };
    
    // Month DD, YYYY
    const monthMatch = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (monthMatch) {
      const month = monthMap[monthMatch[1].toLowerCase()];
      const day = monthMatch[2].padStart(2, '0');
      const year = monthMatch[3];
      return `${year}-${month}-${day}`;
    }
    
    return null;
  }

  private selectBest(candidates: Array<{value: string, confidence: number}>): string | undefined {
    if (candidates.length === 0) return undefined;
    
    // Sort by confidence and return the best
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0].value;
  }
}
