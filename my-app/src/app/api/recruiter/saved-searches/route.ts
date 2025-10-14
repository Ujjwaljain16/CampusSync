import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(['recruiter', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const supabase = await createSupabaseServerClient();
    
    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', auth.user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: searches || [],
      total: searches?.length || 0
    });

  } catch (error: any) {
    console.error('Saved searches fetch error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['recruiter', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      name: string;
      description?: string;
      filters: {
        skills?: string[];
        institutions?: string[];
        verification_status?: string[];
        confidence_min?: number;
        date_from?: string;
        date_to?: string;
      };
      is_public?: boolean;
    } | null;

    if (!body || !body.name || !body.filters) {
      return NextResponse.json({ 
        error: 'Missing required fields: name, filters' 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: auth.user?.id,
        name: body.name,
        description: body.description || null,
        search_filters: body.filters,
        is_public: body.is_public || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the creation
    await supabase.from('audit_logs').insert({
      user_id: auth.user?.id,
      action: 'create_saved_search',
      target_id: data.id,
      details: {
        name: body.name,
        filters: body.filters,
        is_public: body.is_public
      },
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      data: data,
      message: 'Saved search created successfully'
    });

  } catch (error: any) {
    console.error('Saved search creation error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}