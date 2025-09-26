// PaddleOCR integration for self-hosted OCR
export class PaddleOCR {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.PADDLE_OCR_URL || 'http://localhost:8866') {
    this.baseUrl = baseUrl;
  }

  async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBuffer.toString('base64'),
          return_confidence: true
        })
      });

      if (!response.ok) {
        throw new Error(`PaddleOCR API error: ${response.status}`);
      }

      const result = await response.json();
      
      // Extract text from PaddleOCR response
      if (result.text && Array.isArray(result.text)) {
        return result.text.map((line: any) => line.text || '').join('\n');
      }
      
      return result.text || '';
    } catch (error) {
      console.error('PaddleOCR extraction failed:', error);
      throw error;
    }
  }

  async extractWithConfidence(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBuffer.toString('base64'),
          return_confidence: true
        })
      });

      if (!response.ok) {
        throw new Error(`PaddleOCR API error: ${response.status}`);
      }

      const result = await response.json();
      
      let text = '';
      let confidence = 0;

      if (result.text && Array.isArray(result.text)) {
        text = result.text.map((line: any) => line.text || '').join('\n');
        confidence = result.text.reduce((acc: number, line: any) => 
          acc + (line.confidence || 0), 0) / result.text.length;
      } else {
        text = result.text || '';
        confidence = result.confidence || 0;
      }
      
      return { text, confidence };
    } catch (error) {
      console.error('PaddleOCR extraction with confidence failed:', error);
      throw error;
    }
  }
}
