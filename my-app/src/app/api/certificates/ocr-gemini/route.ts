// GEMINI VISION API - Direct certificate extraction
import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAuth, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rateLimit';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const POST = withAuth(async (request: NextRequest, { user }) => {
	// Expensive (storage + paid LLM call): per-user limit
	const limited = enforceRateLimit(request, 'ocr-gemini', { interval: 60 * 1000, uniqueTokenPerInterval: 6 }, user.id);
	if (limited) return limited;

	const formData = await request.formData().catch(() => null);
	const file = formData?.get('file');
	
	if (!file || typeof file === 'string') {
		throw apiError.badRequest('No file uploaded');
	}
	if (file.size === 0 || file.size > MAX_FILE_BYTES) {
		throw apiError.badRequest('File must be between 1 byte and 10 MB');
	}
	if (!ALLOWED_MIME_TYPES.includes(file.type)) {
		throw apiError.badRequest('Unsupported file type. Upload a JPEG, PNG, WebP or PDF.');
	}

	logger.debug('Using Gemini Vision API for certificate extraction', { 
		fileName: file.name, 
		fileSize: file.size, 
		fileType: file.type 
	});
	
	// 2. Upload file to Supabase Storage
	const bytes = await file.arrayBuffer();
	const buffer = Buffer.from(bytes);
	
	const timestamp = Date.now();
	const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const filePath = `${user.id}/${timestamp}_${sanitizedFileName}`;
	
	logger.debug('Uploading to Supabase Storage', { filePath, bufferSize: buffer.length });
	
	const supabase = await createSupabaseServerClient();
	const { data: uploadData, error: uploadError } = await supabase.storage
		.from('certificates')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});
	
	if (uploadError) {
		logger.error('Storage upload failed', uploadError);
		throw apiError.internal('Failed to upload file');
	}
	
	// 3. Get public URL
	const { data: { publicUrl } } = supabase.storage
		.from('certificates')
		.getPublicUrl(filePath);
	
	logger.debug('File uploaded successfully', { publicUrl });

		// 4. Initialize Gemini for text extraction (use buffer we already have)
		const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
		const model = genAI.getGenerativeModel({ 
			model: 'gemini-2.0-flash-exp',
			generationConfig: {
				temperature: 0.1,  // Lower temperature for more accurate extraction
				maxOutputTokens: 2048,  // Limit output size
			}
		});

		// Prepare image data (use original buffer - Gemini handles compression)
		const base64Image = buffer.toString('base64');
		const imagePart = {
			inlineData: {
				data: base64Image,
				mimeType: file.type || 'image/jpeg'
			}
		};
		
		logger.debug('Sending to Gemini Vision API');

		// Prompt for extraction (optimized for speed and accuracy)
		const prompt = `Extract certificate information as JSON:

{
  "title": "certificate title/course name",
  "institution": "issuing organization",
  "recipient": "recipient name",
  "date_issued": "YYYY-MM-DD format",
  "description": "2-3 sentences covering: purpose, project/course details, duration, achievements, skills, grades",
  "raw_text": "all visible text",
  "confidence": 0.95
}

Extract all text accurately. Return only valid JSON, no markdown.`;

		// Call Gemini Vision API
		const result = await model.generateContent([prompt, imagePart]);
		const response = await result.response;
		const text = response.text();

		logger.debug('Gemini response received', { responsePreview: text.substring(0, 500) });

		// Parse JSON from response
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Failed to parse JSON from Gemini response');
		}

		const extracted = JSON.parse(jsonMatch[0]);
	logger.debug('Extraction successful', {
		title: extracted.title,
		institution: extracted.institution,
		recipient: extracted.recipient,
		dateIssued: extracted.date_issued,
		description: extracted.description
	});

	return success({
		success: true,
		publicUrl,
		filePath: uploadData.path,
		ocr: {
			title: extracted.title || '',
			institution: extracted.institution || '',
			recipient: extracted.recipient || '',
			date_issued: extracted.date_issued || '',
			description: extracted.description || '',
			raw_text: extracted.raw_text || text,
			confidence: extracted.confidence || 0.9,
			extracted_fields: {
				title: extracted.title || '',
				institution: extracted.institution || '',
				recipient: extracted.recipient || '',
				date_issued: extracted.date_issued || ''
			}
		}
	}, 'Certificate extraction successful');
});
