import { Jimp } from 'jimp';
import { QRCodeReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';
import { createHash } from 'crypto';
import { createSupabaseServerClient } from './supabaseServer';
import type { 
  TrustedIssuer, 
  VerificationRule, 
  CertificateMetadata, 
  VerificationResult,
  OcrExtractionResult 
} from '../src/types';

export class VerificationEngine {
  private supabase: any;
  private qrReader: QRCodeReader;
  private trustedIssuers: TrustedIssuer[] = [];
  private verificationRules: VerificationRule[] = [];

  constructor() {
    this.supabase = null; // Will be initialized in initialize()
    this.qrReader = new QRCodeReader();
  }

  /**
   * Initialize the verification engine by loading trusted issuers and rules
   */
  async initialize(): Promise<void> {
    this.supabase = await createSupabaseServerClient();
    await this.loadTrustedIssuers();
    await this.loadVerificationRules();
  }

  /**
   * Main verification method that orchestrates all verification steps
   */
  async verifyCertificate(
    certificateId: string,
    fileBuffer: Buffer,
    ocrResult: OcrExtractionResult
  ): Promise<VerificationResult> {
    const startTime = new Date().toISOString();
    
    // Initialize if not already done
    if (this.trustedIssuers.length === 0) {
      await this.initialize();
    }

    const verificationDetails: VerificationResult['details'] = {};
    let confidenceScore = 0;
    let verificationMethod = 'manual';
    let autoApproved = false;

    try {
      // Step 1: QR Code Verification
      const qrResult = await this.verifyQRCode(fileBuffer);
      verificationDetails.qr_verification = qrResult;
      
      if (qrResult.verified) {
        confidenceScore = 0.99;
        verificationMethod = 'qr_verification';
        autoApproved = true;
      } else {
        // Step 2: Logo Matching
        const logoResult = await this.verifyLogoMatch(fileBuffer);
        verificationDetails.logo_match = logoResult;

        // Step 3: Template Matching
        const templateResult = await this.verifyTemplateMatch(ocrResult);
        verificationDetails.template_match = templateResult;

        // Step 4: Metadata checks (issuer/date/title presence + heuristics)
        const metadataChecks = await this.verifyMetadata(ocrResult);
        verificationDetails.metadata_checks = metadataChecks;

        // Step 5: Dedupe / similarity
        const dedupe = await this.checkDuplicates(fileBuffer, ocrResult);
        verificationDetails.dedupe = dedupe;

        // Step 6: AI Confidence Scoring
        const aiResult = await this.calculateAIConfidence(ocrResult, logoResult, templateResult);
        verificationDetails.ai_confidence = aiResult;

        // Calculate weighted confidence score
        confidenceScore = this.calculateWeightedConfidence(
          verificationDetails.logo_match!,
          verificationDetails.template_match!,
          verificationDetails.ai_confidence!,
          verificationDetails.metadata_checks!,
          verificationDetails.dedupe!
        );
        
        // Determine verification method and auto-approval
        if (confidenceScore >= 0.9) {
          verificationMethod = 'automated_verification';
          autoApproved = true;
        } else if (confidenceScore >= 0.7) {
          verificationMethod = 'automated_verification';
          autoApproved = false; // Requires manual review
        } else {
          verificationMethod = 'manual_review_required';
          autoApproved = false;
        }
      }

      // Store verification metadata
      await this.storeVerificationMetadata(certificateId, verificationDetails, confidenceScore, verificationMethod);

      const result: VerificationResult = {
        certificate_id: certificateId,
        is_verified: autoApproved,
        confidence_score: confidenceScore,
        verification_method: verificationMethod,
        details: verificationDetails,
        auto_approved: autoApproved,
        requires_manual_review: !autoApproved,
        created_at: startTime
      };

      return result;

    } catch (error) {
      console.error('Verification error:', error);
      
      // Return a failed verification result
      return {
        certificate_id: certificateId,
        is_verified: false,
        confidence_score: 0,
        verification_method: 'error',
        details: verificationDetails,
        auto_approved: false,
        requires_manual_review: true,
        created_at: startTime
      };
    }
  }

  /**
   * QR Code Verification
   */
  private async verifyQRCode(fileBuffer: Buffer): Promise<NonNullable<VerificationResult['details']['qr_verification']>> {
    try {
      // Convert buffer to Jimp image
      const image = await Jimp.read(fileBuffer);
      const { width, height, data } = image.bitmap as { width: number; height: number; data: Buffer };

      // Convert RGBA buffer to grayscale luminance array
      const luminances = new Uint8ClampedArray(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Standard luminance conversion
          luminances[y * width + x] = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
        }
      }

      const source = new RGBLuminanceSource(luminances, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const result = this.qrReader.decode(bitmap);

      const qrData = result.getText();
      const matchingIssuer = this.trustedIssuers.find(issuer => 
        issuer.qr_verification_url && qrData.includes(issuer.qr_verification_url)
      );

      return {
        verified: !!matchingIssuer,
        data: qrData,
        issuer: matchingIssuer?.name
      };
    } catch (error) {
      console.log('QR code not found or invalid:', error);
      return { verified: false };
    }
  }

  /**
   * Logo Matching using Perceptual Hashing
   */
  private async verifyLogoMatch(fileBuffer: Buffer): Promise<NonNullable<VerificationResult['details']['logo_match']>> {
    try {
      const image = await Jimp.read(fileBuffer);
      
      // Resize to standard size for consistent hashing
      (image as any).resize(32, 32);
      
      // Convert to grayscale
      (image as any).greyscale();
      
      // Calculate perceptual hash
      const logoHash = this.calculatePerceptualHash(image);
      
      // Compare with trusted issuers
      let bestMatch = { issuer: null as TrustedIssuer | null, score: 0 };
      
      for (const issuer of this.trustedIssuers) {
        if (issuer.logo_hash) {
          const hammingDistance = this.calculateHammingDistance(logoHash, issuer.logo_hash);
          const score = 1 - (hammingDistance / 64); // Normalize to 0-1
          
          if (score > bestMatch.score) {
            bestMatch = { issuer, score };
          }
        }
      }

      return {
        matched: bestMatch.score > 0.8, // Threshold for logo match
        score: bestMatch.score,
        issuer: bestMatch.issuer?.name
      };
    } catch (error) {
      console.log('Logo matching failed:', error);
      return { matched: false, score: 0 };
    }
  }

  /**
   * Template Pattern Matching
   */
  private async verifyTemplateMatch(ocrResult: OcrExtractionResult): Promise<NonNullable<VerificationResult['details']['template_match']>> {
    const text = ocrResult.raw_text || '';
    const patternsMatched: string[] = [];
    let bestScore = 0;
    let bestIssuer: TrustedIssuer | null = null;

    for (const issuer of this.trustedIssuers) {
      let issuerScore = 0;
      let matchedPatterns: string[] = [];

      for (const pattern of issuer.template_patterns) {
        try {
          const regex = new RegExp(pattern, 'gi');
          if (regex.test(text)) {
            issuerScore += 1;
            matchedPatterns.push(pattern);
          }
        } catch (error) {
          console.log('Invalid regex pattern:', pattern);
        }
      }

      // Normalize score by number of patterns
      const normalizedScore = issuer.template_patterns.length > 0 
        ? issuerScore / issuer.template_patterns.length 
        : 0;

      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestIssuer = issuer;
        patternsMatched.push(...matchedPatterns);
      }
    }

    return {
      matched: bestScore > 0.6, // Threshold for template match
      score: bestScore,
      patterns_matched: patternsMatched
    };
  }

  /**
   * Metadata validation: presence/format checks and basic issuer consistency
   */
  private async verifyMetadata(ocrResult: OcrExtractionResult): Promise<NonNullable<VerificationResult['details']['metadata_checks']>> {
    const issues: string[] = [];
    let score = 0;

    if (ocrResult.title && ocrResult.title.length >= 3) score += 0.25; else issues.push('missing_title');
    if (ocrResult.institution && ocrResult.institution.length >= 3) score += 0.25; else issues.push('missing_institution');
    if (ocrResult.recipient && ocrResult.recipient.length >= 3) score += 0.2; else issues.push('missing_recipient');
    if (ocrResult.date_issued && /\d{4}-\d{2}-\d{2}/.test(ocrResult.date_issued)) score += 0.2; else issues.push('invalid_or_missing_date');
    if ((ocrResult.description || '').length >= 10) score += 0.1; else issues.push('weak_description');

    return { score: Math.min(score, 1), issues };
  }

  /**
   * Dedupe via file hash and text similarity against recent certificates
   */
  private async checkDuplicates(fileBuffer: Buffer, ocrResult: OcrExtractionResult): Promise<NonNullable<VerificationResult['details']['dedupe']>> {
    try {
      const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

      // Lookup any certificate_metadata with same file hash (if stored)
      const { data: existing, error } = await this.supabase
        .from('certificate_metadata')
        .select('certificate_id, verification_details')
        .ilike('verification_details->>file_hash', fileHash);

      if (!error && existing && existing.length > 0) {
        return { is_duplicate: true, file_hash: fileHash };
      }

      // Fallback: simple cosine-like similarity on text vs recent 50
      const { data: recent } = await this.supabase
        .from('certificate_metadata')
        .select('certificate_id, verification_details')
        .order('created_at', { ascending: false })
        .limit(50);

      const text = (ocrResult.raw_text || '').toLowerCase();
      let bestSim = 0;
      let bestId: string | undefined;
      for (const row of recent || []) {
        const otherText = (row.verification_details?.ocr_text || '').toLowerCase();
        if (!otherText) continue;
        const sim = this.jaccardSimilarity(this.tokenize(text), this.tokenize(otherText));
        if (sim > bestSim) { bestSim = sim; bestId = row.certificate_id; }
      }

      return { is_duplicate: bestSim > 0.95, text_similarity: bestSim, similar_certificate_id: bestId };
    } catch {
      return { is_duplicate: false };
    }
  }

  private tokenize(t: string): Set<string> {
    return new Set(t.split(/[^a-z0-9]+/g).filter(Boolean));
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return inter / union;
  }

  /**
   * AI Confidence Scoring
   */
  private async calculateAIConfidence(
    ocrResult: OcrExtractionResult,
    logoResult: NonNullable<VerificationResult['details']['logo_match']>,
    templateResult: NonNullable<VerificationResult['details']['template_match']>
  ): Promise<NonNullable<VerificationResult['details']['ai_confidence']>> {
    const factors: string[] = [];
    let score = 0;

    // OCR confidence factor
    if (ocrResult.confidence && ocrResult.confidence > 0.8) {
      score += 0.2;
      factors.push('high_ocr_confidence');
    } else if (ocrResult.confidence && ocrResult.confidence > 0.6) {
      score += 0.1;
      factors.push('medium_ocr_confidence');
    }

    // Logo match factor
    if (logoResult.matched) {
      score += 0.3;
      factors.push('logo_match');
    }

    // Template match factor
    if (templateResult.matched) {
      score += 0.3;
      factors.push('template_match');
    }

    // Text quality factors
    const text = ocrResult.raw_text || '';
    if (text.length > 100) {
      score += 0.1;
      factors.push('sufficient_text_length');
    }

    // Institution name presence
    if (ocrResult.institution && ocrResult.institution.length > 2) {
      score += 0.1;
      factors.push('institution_name_present');
    }

    return {
      score: Math.min(score, 1.0),
      factors
    };
  }

  /**
   * Calculate weighted confidence score
   */
  private calculateWeightedConfidence(
    logoResult: NonNullable<VerificationResult['details']['logo_match']>,
    templateResult: NonNullable<VerificationResult['details']['template_match']>,
    aiResult: NonNullable<VerificationResult['details']['ai_confidence']>,
    metadata: NonNullable<VerificationResult['details']['metadata_checks']>,
    dedupe: NonNullable<VerificationResult['details']['dedupe']>
  ): number {
    const weights = {
      logo: 0.2,
      template: 0.25,
      ai: 0.35,
      metadata: 0.15,
      dedupePenalty: 0.4 // subtract if duplicate
    } as const;

    let score = (
      (logoResult.score * weights.logo) +
      (templateResult.score * weights.template) +
      (aiResult.score * weights.ai) +
      (metadata.score * weights.metadata)
    );

    if (dedupe.is_duplicate) score = Math.max(0, score - weights.dedupePenalty);
    return Math.min(1, score);
  }

  /**
   * Calculate perceptual hash for image
   */
  private calculatePerceptualHash(image: any): string {
    const hash = createHash('md5');
    const pixels = image.bitmap.data;
    
    // Simple hash based on average brightness of 8x8 grid
    const gridSize = 8;
    const cellWidth = Math.floor(image.bitmap.width / gridSize);
    const cellHeight = Math.floor(image.bitmap.height / gridSize);
    
    let hashString = '';
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let brightness = 0;
        let pixelCount = 0;
        
        for (let cy = 0; cy < cellHeight; cy++) {
          for (let cx = 0; cx < cellWidth; cx++) {
            const pixelY = y * cellHeight + cy;
            const pixelX = x * cellWidth + cx;
            const pixelIndex = (pixelY * image.bitmap.width + pixelX) * 4;
            
            if (pixelIndex < pixels.length) {
              const r = pixels[pixelIndex];
              const g = pixels[pixelIndex + 1];
              const b = pixels[pixelIndex + 2];
              brightness += (r + g + b) / 3;
              pixelCount++;
            }
          }
        }
        
        const avgBrightness = pixelCount > 0 ? brightness / pixelCount : 0;
        hashString += avgBrightness > 128 ? '1' : '0';
      }
    }
    
    return hashString;
  }

  /**
   * Calculate Hamming distance between two hashes
   */
  private calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 64; // Max distance
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    return distance;
  }

  /**
   * Store verification metadata in database
   */
  private async storeVerificationMetadata(
    certificateId: string,
    details: VerificationResult['details'],
    confidenceScore: number,
    verificationMethod: string
  ): Promise<void> {
    try {
      const metadata: Partial<CertificateMetadata> = {
        certificate_id: certificateId,
        qr_code_data: details.qr_verification?.data,
        qr_verified: details.qr_verification?.verified || false,
        logo_hash: details.logo_match ? this.calculatePerceptualHash(await Jimp.read(Buffer.alloc(0))) : undefined,
        logo_match_score: details.logo_match?.score,
        template_match_score: details.template_match?.score,
        ai_confidence_score: details.ai_confidence?.score,
        verification_method: verificationMethod,
        verification_details: {
          ...details,
          file_hash: undefined,
          ocr_text: undefined
        }
      };

      await this.supabase.from('certificate_metadata').upsert(metadata);
    } catch (error) {
      console.error('Failed to store verification metadata:', error);
    }
  }

  /**
   * Load trusted issuers from database
   */
  private async loadTrustedIssuers(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('trusted_issuers')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      
      // Parse template_patterns from JSONB to string array
      this.trustedIssuers = (data || []).map((issuer: any) => ({
        ...issuer,
        template_patterns: Array.isArray(issuer.template_patterns) 
          ? issuer.template_patterns 
          : JSON.parse(issuer.template_patterns || '[]')
      }));
    } catch (error) {
      console.error('Failed to load trusted issuers:', error);
      this.trustedIssuers = [];
    }
  }

  /**
   * Load verification rules from database
   */
  private async loadVerificationRules(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('verification_rules')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      this.verificationRules = data || [];
    } catch (error) {
      console.error('Failed to load verification rules:', error);
      this.verificationRules = [];
    }
  }
}
