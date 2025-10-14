// LLM-based Text Structure Extraction
import { extractFromText } from '../ocrExtract';

export interface ExtractedFields {
  title?: string;
  institution?: string;
  recipient?: string;
  date_issued?: string;
  certificate_id?: string;
  description?: string;
}

export class LLMExtractor {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  }

  async structureText(rawText: string): Promise<ExtractedFields> {
    if (!this.apiKey) {
      console.warn('⚠️ No Gemini API key found, using fallback extraction');
      return this.fallbackExtraction(rawText);
    }

    // Always use Gemini if we have an API key - no matter how short the text
    if (!rawText || rawText.trim().length === 0) {
      console.warn('⚠️ Empty text, using fallback');
      return this.fallbackExtraction(rawText);
    }

    try {
      console.log('🤖 Using Gemini AI for extraction...');
      console.log(`📝 Text length: ${rawText.trim().length} characters`);
      
      // Add timeout to prevent hanging (increased to 15s for better accuracy)
      const result = await Promise.race([
        this.extractWithLLM(rawText),
        new Promise<ExtractedFields>((_, reject) => 
          setTimeout(() => reject(new Error('Gemini API timeout')), 15000)
        )
      ]);
      
      console.log('✅ Gemini extraction completed successfully');
      console.log('📊 Extracted fields:', result);
      return result;
    } catch (error) {
      console.warn('❌ Gemini extraction failed, using fallback:', error);
      return this.fallbackExtraction(rawText);
    }
  }

  private async extractWithLLM(text: string): Promise<ExtractedFields> {
    const prompt = `You are an expert at extracting structured information from certificate OCR text. Extract the following information and return ONLY a valid JSON object:

{
  "title": "exact course/program/certificate name (not recipient name)",
  "institution": "issuing organization/university/company",
  "recipient": "student/recipient full name", 
  "date_issued": "YYYY-MM-DD format",
  "certificate_id": "any certificate ID/serial number found",
  "description": "brief 1-2 line description of achievement"
}

CRITICAL RULES:
- Return ONLY the JSON object, no markdown, no explanation, no extra text
- title should be the course/program name, NOT the person's name
- recipient should be the person's name, NOT the course name
- Convert all dates to YYYY-MM-DD format (e.g., "June 19, 2023" → "2023-06-19")
- Use null for any missing fields
- Fix common OCR errors (e.g., "IT Bombay" → "IIT Bombay", "nership" → "nternship")
- For IIT certificates, title should include "IIT Bombay Research Internship" format

OCR Text:
${text}`;

    // Implementation would call OpenAI/Anthropic API
    const response = await this.callLLMAPI(prompt);
    
    try {
      // Clean up response - remove markdown code blocks if present
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      return JSON.parse(cleanResponse);
    } catch (e) {
      console.error('Failed to parse LLM response:', response);
      return this.fallbackExtraction(text);
    }
  }

  private async callLLMAPI(prompt: string): Promise<string> {
    if (process.env.GEMINI_API_KEY) {
      return await this.callGemini(prompt);
    } else if (process.env.OPENAI_API_KEY) {
      return await this.callOpenAI(prompt);
    } else if (process.env.ANTHROPIC_API_KEY) {
      return await this.callClaude(prompt);
    }
    
    throw new Error('No LLM API configured');
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callGemini(prompt: string): Promise<string> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        }
      })
    });

    const data = await response.json();
    
    // Handle Gemini API errors
    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid Gemini API response structure');
    }
    
    return data.candidates[0].content.parts[0].text;
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return data.content[0].text;
  }

  private fallbackExtraction(text: string): ExtractedFields {
    // Fallback to rule-based extraction when LLM fails
    const result = extractFromText(text);
    
    return {
      title: result.title,
      institution: result.institution,
      recipient: result.recipient,
      date_issued: result.date_issued,
      certificate_id: result.certificate_id,
      description: result.description
    };
  }
}
