import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError } from '@/lib/api';

interface VerificationResult {
  confidence_score?: number;
  auto_approved?: boolean;
  details?: unknown;
}

interface CertificateRow {
  verification_results?: VerificationResult | VerificationResult[];
  [key: string]: unknown;
}

export const GET = withRole(['faculty', 'admin'], async () => {
  const supabase = await createSupabaseServerClient();
  
  // Flagged queue: pending certificates that are NOT auto-approved (from verification_results)
  const { data, error } = await supabase
    .from('certificates')
    .select('*, verification_results:verification_results(confidence_score, auto_approved, details)')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw apiError.internal(error.message);

  // Filter to only those that require manual review (auto_approved === false)
  const flagged = (data || []).filter((row: CertificateRow) => {
    const vr = Array.isArray(row.verification_results) ? row.verification_results[0] : row.verification_results;
    return vr ? vr.auto_approved === false : true; // if no result, keep for review
  });

  return success(flagged);
});



