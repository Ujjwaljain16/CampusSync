import { NextRequest, NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import { createSupabaseServerClient, createSupabaseAdminClient } from '../../../../../lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';
import { extractFromText } from '../../../../lib/ocrExtract';
import { LLMExtractor } from '../../../../lib/ocr/llmExtractor';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';
import { PDFDocument } from 'pdf-lib';
import { fromBuffer } from 'pdf2pic';
import fs from 'fs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
	const supabase = await createSupabaseServerClient();
	const admin = createSupabaseAdminClient();

	const BUCKET_NAME = process.env.NEXT_PUBLIC_CERTIFICATES_BUCKET || 'certificates';

	const bypassStorage = process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-storage') === '1';

	// Resolve Tesseract worker/core paths to avoid Next worker bundling issues
	const require = createRequire(import.meta.url);
	let workerPath: URL | undefined;
	let corePath: URL | undefined;
	try {
		// Resolve to absolute file URLs for Node worker compatibility
		const workerResolved = require.resolve('tesseract.js/dist/worker.min.js');
		const coreResolved = require.resolve('tesseract.js-core/tesseract-core.wasm.js');
		workerPath = pathToFileURL(workerResolved);
		corePath = pathToFileURL(coreResolved);
	} catch (e) {
		// Fallback: leave undefined, library will attempt defaults
	}

	let {
		data: { user },
		error: userError
	} = await supabase.auth.getUser();

	// Dev-only test bypass
	if (!user && process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-auth') === '1') {
		user = { id: process.env.TEST_STUDENT_USER_ID || 'test-user' } as any;
	}

	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	let formData, file, enableSmartVerification, clientRawText, clientConfidence;
	
	// Handle both FormData (normal uploads) and JSON (testing)
	const contentType = req.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		// JSON mode for testing
		const body = await req.json();
		file = null;
		enableSmartVerification = body.enableSmartVerification === true;
		clientRawText = body.rawText;
		clientConfidence = body.ocrConfidence;
	} else {
		// FormData mode for file uploads
		formData = await req.formData();
		file = formData.get('file');
		enableSmartVerification = formData.get('enableSmartVerification') === 'true';
		clientRawText = formData.get('rawText');
		clientConfidence = formData.get('ocrConfidence');
	}

	let buffer: Buffer | null = null;
	
	// Only process file if it exists (not in JSON test mode)
	if (file) {
	if (!(file instanceof Blob)) {
			return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
		}
		const arrayBuffer = await file.arrayBuffer();
		buffer = Buffer.from(arrayBuffer);
	} else if (!clientRawText) {
		return NextResponse.json({ error: 'Missing file or rawText for testing' }, { status: 400 });
	}


	let storage: { path: string } | null = null;
	let publicUrlStr: string = '';
	if (!bypassStorage && buffer) {
		// Ensure storage bucket exists
		try {
			const { data: existingBucket } = await admin.storage.getBucket(BUCKET_NAME);
			if (!existingBucket) {
				await admin.storage.createBucket(BUCKET_NAME, { public: true });
			}
		} catch (e: any) {
			// Attempt to create bucket if getBucket failed (e.g., not found in some environments)
			try {
				await admin.storage.createBucket(BUCKET_NAME, { public: true });
			} catch (createErr: any) {
				return NextResponse.json({ error: createErr?.message || 'Failed to ensure storage bucket' }, { status: 500 });
			}
		}

		// Store in Supabase Storage
	const filename = `${user.id}/${Date.now()}-${(file as any).name || 'upload'}`;
		const { data: uploaded, error: storageError } = await admin.storage
			.from(BUCKET_NAME)
		.upload(filename, buffer, { contentType: (file as any).type || 'application/octet-stream', upsert: true });
	if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
		storage = uploaded as any;
		publicUrlStr = admin.storage.from(BUCKET_NAME).getPublicUrl(storage!.path).data.publicUrl;
	} else {
		storage = { path: 'test/path' };
		publicUrlStr = 'test://public-url';
	}

	// OCR: prefer client-provided text for instant autofill, else (optionally) server OCR
	let ocrText = typeof clientRawText === 'string' ? clientRawText : '';
	let ocrConfidence: number | undefined = typeof clientConfidence === 'string' ? Number(clientConfidence) : undefined;
	
	// For PDFs or when client OCR is not available/insufficient, try server OCR
	const isPdf = file && ((file as any).type === 'application/pdf' || (file as any).name?.toLowerCase().endsWith('.pdf'));
	const hasInsufficientClientOcr = !ocrText || ocrText.trim().length < 10;
	const shouldTryServerOcr = buffer && hasInsufficientClientOcr && (process.env.OCR_ENABLED === 'true' || isPdf);
	
	if (shouldTryServerOcr && buffer) {
		try {
			if (isPdf) {
				// For PDFs, convert to image and run OCR
				try {
					// Ensure tmp directory exists
					const tmpDir = path.join(process.cwd(), 'tmp');
					if (!fs.existsSync(tmpDir)) {
						fs.mkdirSync(tmpDir, { recursive: true });
					}
					
					// Convert PDF first page to image
					const convert = fromBuffer(buffer, {
						density: 200,           // Higher density for better OCR
						saveFilename: "untitled",
						savePath: tmpDir,
						format: "png",
						width: 2000,
						height: 2000
					});
					
					const convertResult = await convert(1, { responseType: "buffer" });
					
					if (convertResult.buffer) {
						// Run OCR on the converted image
						const { data: ocrData } = await Tesseract.recognize(convertResult.buffer, 'eng', {
							langPath: process.env.TESSERACT_LANG_CDN || 'https://tessdata.projectnaptha.com/4.0.0',
							workerPath: workerPath?.toString(),
							corePath: corePath?.toString(),
						});
						ocrText = ocrData?.text || '';
						ocrConfidence = ocrData?.confidence ? ocrData.confidence / 100 : undefined;
					} else {
						throw new Error('PDF to image conversion failed');
					}
				} catch (pdfErr) {
					// Fallback to metadata extraction
					try {
						const pdfDoc = await PDFDocument.load(buffer);
						const pages = pdfDoc.getPages();
						const title = pdfDoc.getTitle() || '';
						const author = pdfDoc.getAuthor() || '';
						const subject = pdfDoc.getSubject() || '';
						
						let pdfText = 'Certificate of Achievement\n';
						if (title) pdfText += `Title: ${title}\n`;
						if (author) pdfText += `Issued by: ${author}\n`;
						if (subject) pdfText += `Subject: ${subject}\n`;
						pdfText += `Document contains ${pages.length} page(s)\n`;
						pdfText += 'Please review and edit the extracted information below.';
						
						ocrText = pdfText;
						ocrConfidence = title || author || subject ? 0.5 : 0.3;
					} catch (fallbackErr) {
						ocrText = 'Certificate Document\nPlease enter the certificate details manually.';
						ocrConfidence = 0.2;
					}
				}
			} else {
				const { data: ocrData } = await Tesseract.recognize(buffer, 'eng', {
					langPath: process.env.TESSERACT_LANG_CDN || 'https://tessdata.projectnaptha.com/4.0.0',
					workerPath: workerPath?.toString(),
					corePath: corePath?.toString(),
				});
				ocrText = ocrData?.text || '';
				ocrConfidence = ocrData?.confidence ? ocrData.confidence / 100 : undefined;
			}
		} catch (ocrErr: any) {
			// swallow OCR errors; continue with extraction fallback
		}
	}

	// Enhanced extraction with Gemini AI + fallback to rule-based
	let result;
	let usedGemini = false;
	try {
		const llmExtractor = new LLMExtractor();
		const geminiResult = await llmExtractor.structureText(ocrText);
		usedGemini = true;
		// Validate Gemini results and merge with rule-based fallback
		const ruleBasedResult = extractFromText(ocrText, ocrConfidence);
		result = {
			raw_text: ocrText,
			confidence: ocrConfidence,
			title: geminiResult.title || ruleBasedResult.title,
			institution: geminiResult.institution || ruleBasedResult.institution,
			recipient: geminiResult.recipient || ruleBasedResult.recipient,
			date_issued: geminiResult.date_issued || ruleBasedResult.date_issued,
			description: geminiResult.description || ruleBasedResult.description,
		};
	} catch (error) {
		result = extractFromText(ocrText, ocrConfidence);
	}

	// Ensure confidence is always a number 0..1
	if (typeof result.confidence !== 'number') {
		result.confidence = usedGemini ? 0.85 : (ocrText ? 0.5 : 0);
	}

	// If smart verification is enabled, run verification
	let verificationResult = null;
	if (enableSmartVerification && !bypassStorage && buffer) {
		try {
			const verificationEngine = new VerificationEngine();
			await verificationEngine.initialize();
			
			// Create a temporary certificate record for verification (use admin to avoid RLS issues)
			const { data: tempCert } = await admin.from('certificates').insert({
				user_id: user.id,
				title: result.title || 'Untitled Certificate',
				institution: result.institution || '',
				date_issued: result.date_issued || new Date().toISOString(),
				description: result.description || result.raw_text || '',
				file_url: publicUrlStr,
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
			// swallow verification errors in response
		}
	}

	// Normalize OCR output to always include keys
	const normalizedOcr = {
		title: result.title ?? '',
		institution: result.institution ?? '',
		date_issued: result.date_issued ?? '',
		description: result.description ?? (result.raw_text ?? ''),
		raw_text: result.raw_text ?? '',
		confidence: result.confidence ?? 0,
		recipient: result.recipient ?? '',
	};

	return NextResponse.json({
		data: {
			filePath: storage?.path || '',
			publicUrl: admin.storage.from(BUCKET_NAME).getPublicUrl(storage?.path || '').data.publicUrl,
			ocr: normalizedOcr,
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