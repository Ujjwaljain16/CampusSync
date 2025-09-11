import { NextRequest, NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const formData = await req.formData();
	const file = formData.get('file');
	const enableSmartVerification = formData.get('enableSmartVerification') === 'true';

	if (!(file instanceof Blob)) {
		return NextResponse.json({ error: 'Missing file' }, { status: 400 });
	}

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	// Store in Supabase Storage (bucket must exist: 'certificates')
	const filename = `${user.id}/${Date.now()}-${(file as any).name || 'upload'}`;
	const { data: storage, error: storageError } = await supabase.storage
		.from('certificates')
		.upload(filename, buffer, { contentType: (file as any).type || 'application/octet-stream', upsert: true });
	if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

	// Run OCR
	const { data: ocrData } = await Tesseract.recognize(buffer, 'eng');
	const rawText = ocrData?.text || '';

	// Enhanced extraction heuristics
	const result: OcrExtractionResult = {
		raw_text: rawText,
		confidence: ocrData?.confidence ? ocrData.confidence / 100 : undefined,
		title: extractTitle(rawText),
		institution: extractInstitution(rawText),
		date_issued: extractDate(rawText),
		description: extractDescription(rawText),
	};

	// If smart verification is enabled, run verification
	let verificationResult = null;
	if (enableSmartVerification) {
		try {
			const verificationEngine = new VerificationEngine();
			await verificationEngine.initialize();
			
			// Create a temporary certificate record for verification
			const { data: tempCert } = await supabase.from('certificates').insert({
				user_id: user.id,
				title: result.title || 'Untitled Certificate',
				institution: result.institution || '',
				date_issued: result.date_issued || new Date().toISOString(),
				description: result.description || result.raw_text || '',
				file_url: supabase.storage.from('certificates').getPublicUrl(storage!.path).data.publicUrl,
				verification_status: 'pending',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}).select().single();

			if (tempCert) {
				verificationResult = await verificationEngine.verifyCertificate(
					tempCert.id,
					buffer,
					result
				);
			}
		} catch (error) {
			console.error('Smart verification failed:', error);
		}
	}

	return NextResponse.json({
		data: {
			filePath: storage?.path,
			publicUrl: supabase.storage.from('certificates').getPublicUrl(storage!.path).data.publicUrl,
			ocr: result,
			verification: verificationResult,
		},
	} satisfies { 
		data: { 
			filePath: string; 
			publicUrl: string; 
			ocr: OcrExtractionResult;
			verification?: any;
		} 
	});
}

// Helper functions for enhanced OCR extraction
function extractTitle(text: string): string | undefined {
	const patterns = [
		/Certificate\s+of\s+(.+?)(?:\n|$)/i,
		/Certificate\s+in\s+(.+?)(?:\n|$)/i,
		/This\s+is\s+to\s+certify\s+that\s+.+?\s+has\s+successfully\s+completed\s+(.+?)(?:\n|$)/i,
		/Award\s+of\s+(.+?)(?:\n|$)/i,
		/Completion\s+of\s+(.+?)(?:\n|$)/i,
	];
	
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	
	return undefined;
}

function extractInstitution(text: string): string | undefined {
	const patterns = [
		/(?:from|by|at)\s+([A-Z][^,\n]+(?:University|College|Institute|School|Academy|Corporation|Company|Inc\.|Ltd\.|LLC))/i,
		/([A-Z][^,\n]+(?:University|College|Institute|School|Academy|Corporation|Company|Inc\.|Ltd\.|LLC))/i,
		/(?:Coursera|edX|Udemy|NPTEL|Google|Microsoft|AWS|IBM)/i,
	];
	
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	
	return undefined;
}

function extractDate(text: string): string | undefined {
	const patterns = [
		/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
		/(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
		/(\w+\s+\d{1,2},?\s+\d{4})/,
		/(\d{1,2}\s+\w+\s+\d{4})/,
	];
	
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	
	return undefined;
}

function extractDescription(text: string): string | undefined {
	// Extract the main content, excluding headers and footers
	const lines = text.split('\n').filter(line => line.trim().length > 0);
	
	// Find the main content block (usually the longest paragraph)
	let longestLine = '';
	for (const line of lines) {
		if (line.length > longestLine.length && line.length > 20) {
			longestLine = line;
		}
	}
	
	return longestLine || undefined;
}


