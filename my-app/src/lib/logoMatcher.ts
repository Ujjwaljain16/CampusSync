// Logo/template matcher with SSIM/ORB and CLIP similarity
import { createClient } from '@supabase/supabase-js';

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

interface InstitutionTemplate {
  id: string;
  name: string;
  domain?: string;
  logo_url?: string;
  header_mask_url?: string;
  metadata?: any;
}

export async function matchInstitutionLogo(imageBytes: Buffer, institution?: string): Promise<LogoMatchResult> {
  try {
    // Query institution templates
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabase.from('institution_templates').select('*');
    if (institution) {
      query = query.or(`name.ilike.%${institution}%,domain.ilike.%${institution}%`);
    }
    
    const { data: templates, error } = await query;
    if (error || !templates?.length) {
      return { score: 0, method: 'placeholder', confidence: 0 };
    }

    // For now, return a basic score based on institution name match
    // TODO: Implement actual image similarity comparison
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
    console.error('Logo matching error:', error);
    return { score: 0, method: 'placeholder', confidence: 0 };
  }
}

// Future: Implement actual image similarity
export async function computeImageSimilarity(image1: Buffer, image2: Buffer): Promise<number> {
  // TODO: Implement OpenCV SSIM/ORB comparison
  // For now, return a random score for testing
  return Math.random() * 0.5 + 0.3;
}


