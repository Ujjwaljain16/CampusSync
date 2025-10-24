# Backfill Confidence Scores Script

## What It Does
This script automatically updates your 3 existing certificates with confidence scores by:
1. Fetching all certificates with `NULL` confidence_score
2. Downloading each certificate image from Supabase Storage
3. Re-processing them with Gemini Vision API (same as during upload)
4. Updating the database with the extracted confidence scores

## Prerequisites
✅ All required packages are already installed
✅ GEMINI_API_KEY is set in `.env.local`
✅ Supabase credentials are configured

## How to Run

### Option 1: Using npm script (Recommended)
```bash
npm run backfill:confidence
```

### Option 2: Direct execution
```bash
npx tsx scripts/backfill-confidence-scores.ts
```

## What to Expect

### Console Output
```
🚀 Starting confidence score backfill...

📋 Fetching certificates with missing confidence scores...
📊 Found 3 certificate(s) to process

[1/3] Processing certificate:
  ID: cb2942b1-509c-4744-a33e-d4f0dc9e0580
  Title: Your Certificate Title
  URL: https://...
  📥 Downloading image...
  🤖 Processing with Gemini Vision API...
  ✅ Extracted confidence: 0.92
  💾 Updating database...
  ✅ Success! Confidence score set to 0.92

[2/3] Processing certificate:
  ...

[3/3] Processing certificate:
  ...

═══════════════════════════════════════
📊 Backfill Complete!
✅ Successfully processed: 3
❌ Failed: 0
📈 Total: 3
═══════════════════════════════════════

🔍 Verifying results...

📋 All Certificates:
  - Certificate 1: 92.0%
  - Certificate 2: 88.5%
  - Certificate 3: 95.0%

✨ Done! You can now check your analytics dashboard.
```

## After Running

1. **Check the Database**
   - All certificates should now have confidence_score values
   - Values will be between 0.0 and 1.0 (e.g., 0.92 = 92%)

2. **Refresh Analytics Dashboard**
   - Go to Faculty Dashboard
   - Check "OCR Extraction Quality" card
   - Should now show:
     - Total Extractions: 3
     - High Quality count
     - Average Score percentage
     - Success Rate

3. **Verify Console Logs**
   - Check browser console on analytics page
   - Should see: "Certificates with confidence_score: 3"
   - Should see: "Total metadata entries: 3"

## Troubleshooting

### Script Fails with "Missing Supabase credentials"
- Check `.env.local` has:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Script Fails with "Missing GEMINI_API_KEY"
- Check `.env.local` has `GEMINI_API_KEY`
- The key should start with something like `AIza...`

### "Failed to download image"
- Check that certificate file_url values are valid
- Verify Supabase Storage bucket `certificates` is public

### Rate Limit Errors
- The script has 1-second delays between certificates
- If you have many certificates, it may take time
- Gemini API has generous rate limits for this usage

## Technical Details

- **Gemini Model**: `gemini-2.0-flash-exp`
- **Temperature**: 0.1 (for consistent extraction)
- **Fallback Confidence**: 0.80-0.85 if extraction fails
- **Rate Limiting**: 1-second delay between certificates
- **Database**: Updates `certificates.confidence_score` column

## Files Modified
- `scripts/backfill-confidence-scores.ts` - The backfill script
- `package.json` - Added `backfill:confidence` npm script

## Next Script Runs
After the initial backfill:
- Running the script again will show: "No certificates need backfilling"
- It only processes certificates with NULL confidence_score
- Safe to run multiple times

## Alternative: Manual Update
If you prefer to set confidence scores manually:
```sql
UPDATE certificates 
SET confidence_score = 0.90 
WHERE id = 'your-certificate-id';
```
