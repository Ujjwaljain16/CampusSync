// GEMINI VISION API - Direct certificate extraction
import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAuth, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const POST = withAuth(async (request: NextRequest, { user }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File;
	
	if (!file) {
		throw apiError.badRequest('No file uploaded');
	}

	console.log('🤖 Using Gemini Vision API for certificate extraction');
	console.log(`📄 File: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);
	
	// 2. Upload file to Supabase Storage
	const bytes = await file.arrayBuffer();
	const buffer = Buffer.from(bytes);
	
	const timestamp = Date.now();
	const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const filePath = `${user.id}/${timestamp}_${sanitizedFileName}`;
	
	console.log('📤 Uploading to Supabase Storage:', filePath);
	console.log('📏 Original file size:', buffer.length, 'bytes');
	
	const supabase = await createSupabaseServerClient();
	const { data: uploadData, error: uploadError } = await supabase.storage
		.from('certificates')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: false
		});
	
	if (uploadError) {
		console.error('❌ Storage upload failed:', uploadError);
		throw apiError.internal(`Failed to upload file: ${uploadError.message}`);
	}
	
	// 3. Get public URL
	const { data: { publicUrl } } = supabase.storage
		.from('certificates')
		.getPublicUrl(filePath);
	
	console.log('✅ File uploaded successfully:', publicUrl);

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
		
		console.log('🤖 Sending to Gemini Vision API...');

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

		console.log('📝 Gemini response received');
		console.log(text.substring(0, 500));

		// Parse JSON from response
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Failed to parse JSON from Gemini response');
		}

		const extracted = JSON.parse(jsonMatch[0]);
	console.log('✅ Extraction successful!');
	console.log('Title:', extracted.title);
	console.log('Institution:', extracted.institution);
	console.log('Recipient:', extracted.recipient);
	console.log('Date:', extracted.date_issued);
	console.log('Description:', extracted.description);

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
