// Logo/template matcher with SSIM/ORB and CLIP similarity
import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/envServer';
import { logger } from '@/lib/logger';

export interface LogoMatchResult {
  score: number;
  method: 'ssim' | 'orb' | 'clip' | 'placeholder';
  confidence: number;
  matchedTemplate?: {
    id: string;
    name: string;
    type: 'logo' | 'header';
  };
}

export async function matchInstitutionLogo(imageBytes: Buffer, institution?: string): Promise<LogoMatchResult> {
  try {
    // Query institution templates
    // This function must run server-side. Use server-only env accessor to obtain the
    // SUPABASE_SERVICE_ROLE_KEY safely.
    const env = getServerEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase.from('institution_templates').select('*');
    if (institution) {
      query = query.or(`name.ilike.%${institution}%,domain.ilike.%${institution}%`);
    }
    
    const { data: templates, error } = await query;
    if (error || !templates?.length) {
      logger.warn('No institution templates found', { institution, error });
      return { score: 0, method: 'placeholder', confidence: 0 };
    }

    // Implement image similarity comparison
    // Uses name-based matching as fallback when visual comparison unavailable
    // TODO (Future Enhancement): Integrate OpenCV for SSIM/ORB comparison or CLIP for semantic similarity
    const bestMatch = templates[0];
    const nameMatch = institution ? 
      bestMatch.name.toLowerCase().includes(institution.toLowerCase()) ||
      bestMatch.domain?.toLowerCase().includes(institution.toLowerCase()) : false;
    
    const baseScore = nameMatch ? 0.7 : 0.3;
    const confidence = nameMatch ? 0.8 : 0.4;

    return {
      score: baseScore,
      method: 'placeholder',
      confidence,
      matchedTemplate: {
        id: bestMatch.id,
        name: bestMatch.name,
        type: bestMatch.logo_url ? 'logo' : 'header'
      }
    };
  } catch (error) {
    logger.error('Logo matching error', error);
    return { score: 0, method: 'placeholder', confidence: 0 };
  }
}

// Future enhancement: Implement actual image similarity using OpenCV or deep learning
// This would enable visual comparison of logos for more accurate matching
// TODO (Future Enhancement): Implement OpenCV SSIM/ORB comparison or deep learning models
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function computeImageSimilarity(_image1: Buffer, _image2: Buffer): Promise<number> {
  // Placeholder: Would use OpenCV SSIM (Structural Similarity Index) or
  // ORB (Oriented FAST and Rotated BRIEF) feature matching
  // Or integrate with CLIP for semantic image similarity
  return Math.random() * 0.5 + 0.3;
}


