// Google Vision API Integration
export class GoogleVisionAPI {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_VISION_API_KEY || process.env.GEMINI_API_KEY || '';
  }

  async extractText(imageBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    try {
      const base64Image = imageBuffer.toString('base64');
      
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image
              },
              features: [
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      
      if (data.responses && data.responses[0] && data.responses[0].fullTextAnnotation) {
        return data.responses[0].fullTextAnnotation.text;
      } else if (data.responses && data.responses[0] && data.responses[0].textAnnotations) {
        return data.responses[0].textAnnotations[0]?.description || '';
      }
      
      return '';
    } catch (error) {
      console.error('Google Vision API error:', error);
      throw error;
    }
  }

  // Advanced: Extract structured data directly with Vision API
  async extractStructuredText(imageBuffer: Buffer): Promise<any> {
    const base64Image = imageBuffer.toString('base64');
    
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION'
              },
              {
                type: 'LOGO_DETECTION'
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    return {
      text: data.responses[0]?.fullTextAnnotation?.text || '',
      logos: data.responses[0]?.logoAnnotations || [],
      blocks: data.responses[0]?.fullTextAnnotation?.pages?.[0]?.blocks || []
    };
  }
}
