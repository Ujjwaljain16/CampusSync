import { NextRequest, NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
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

	// Naive extraction heuristics
	const result: OcrExtractionResult = {
		raw_text: rawText,
		confidence: ocrData?.confidence ? ocrData.confidence / 100 : undefined,
	};

	return NextResponse.json({
		data: {
			filePath: storage?.path,
			publicUrl: supabase.storage.from('certificates').getPublicUrl(storage!.path).data.publicUrl,
			ocr: result,
		},
	} satisfies { data: { filePath: string; publicUrl: string; ocr: OcrExtractionResult } });
}


