// Advanced OCR System - Production Ready
import { GoogleVisionAPI } from './ocr/googleVision';
import { PaddleOCR } from './ocr/paddleOCR';
import { LLMExtractor } from './ocr/llmExtractor';
import { ConfidenceScorer } from './ocr/confidenceScorer';

export interface AdvancedOCRResult {
  title: string;
  institution: string;
  recipient: string;
  date_issued: string;
  certificate_id?: string;
  confidence_score: number;
  extraction_method: 'pdf_text' | 'google_vision' | 'paddle_ocr' | 'llm_fallback';
  requires_review: boolean;
}

export class AdvancedOCREngine {
  private googleVision: GoogleVisionAPI;
  private paddleOCR: PaddleOCR;
  private llmExtractor: LLMExtractor;
  private scorer: ConfidenceScorer;

  constructor() {
    this.googleVision = new GoogleVisionAPI();
    this.paddleOCR = new PaddleOCR();
    this.llmExtractor = new LLMExtractor();
    this.scorer = new ConfidenceScorer();
  }

  async processDocument(file: Buffer, mimeType: string): Promise<AdvancedOCRResult> {
    // Step 1: Try PDF text extraction first (fastest, most accurate)
    if (mimeType === 'application/pdf') {
      const pdfResult = await this.extractFromPDF(file);
      if (pdfResult && this.scorer.isHighConfidence(pdfResult)) {
        return pdfResult;
      }
    }

    // Step 2: Preprocess image for better OCR
    const preprocessedImage = await this.preprocessImage(file);

    // Step 3: Try Google Vision API (best quality)
    try {
      const visionResult = await this.googleVision.extractText(preprocessedImage);
      const structuredResult = await this.llmExtractor.structureText(visionResult);
      const scored = this.scorer.scoreResult(structuredResult, 'google_vision');
      
      if (scored.confidence_score > 0.8) {
        return scored;
      }
    } catch (error) {
      console.warn('Google Vision failed, trying fallback:', error);
    }

    // Step 4: Fallback to PaddleOCR (self-hosted)
    try {
      const paddleResult = await this.paddleOCR.extractText(preprocessedImage);
      const structuredResult = await this.llmExtractor.structureText(paddleResult);
      const scored = this.scorer.scoreResult(structuredResult, 'paddle_ocr');
      
      if (scored.confidence_score > 0.6) {
        return scored;
      }
    } catch (error) {
      console.warn('PaddleOCR failed:', error);
    }

    // Step 5: Last resort - basic Tesseract + LLM cleanup
    const tesseractResult = await this.basicTesseractOCR(file);
    const cleanedResult = await this.llmExtractor.structureText(tesseractResult);
    return this.scorer.scoreResult(cleanedResult, 'llm_fallback');
  }

  private async extractFromPDF(buffer: Buffer): Promise<AdvancedOCRResult | null> {
    try {
      // Use pdf-parse for PDF text extraction
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      
      if (data.text && data.text.trim().length > 0) {
        const structuredResult = await this.llmExtractor.structureText(data.text);
        return this.scorer.scoreResult(structuredResult, 'pdf_text');
      }
    } catch (error) {
      console.warn('PDF extraction failed:', error);
    }
    return null;
  }

  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Use Sharp for image preprocessing
      const sharp = require('sharp');
      
      return await sharp(buffer)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
    } catch (error) {
      console.warn('Image preprocessing failed:', error);
      return buffer;
    }
  }

  private async basicTesseractOCR(buffer: Buffer): Promise<string> {
    try {
      // Use Tesseract.js as fallback
      const { createWorker } = require('tesseract.js');
      const worker = await createWorker();
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      const { data: { text } } = await worker.recognize(buffer);
      await worker.terminate();
      
      return text;
    } catch (error) {
      console.error('Tesseract OCR failed:', error);
      return '';
    }
  }
}

// Usage Example:
export async function processDocumentAdvanced(file: Buffer, mimeType: string): Promise<AdvancedOCRResult> {
  const engine = new AdvancedOCREngine();
  return await engine.processDocument(file, mimeType);
}
