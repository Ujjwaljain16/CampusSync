import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(_req: NextRequest) {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {} as Record<string, unknown>
  };

  try {
    // Database connectivity check
    const supabase = await createSupabaseServerClient();
    const dbStart = Date.now();
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1)
        .single();
      
      health.checks.database = {
        status: error ? 'unhealthy' : 'healthy',
        responseTime: Date.now() - dbStart,
        error: error?.message || null
      };
    } catch (dbError: unknown) {
      health.checks.database = {
        status: 'unhealthy',
        responseTime: Date.now() - dbStart,
        error: dbError instanceof Error ? dbError.message : 'Database error'
      };
    }

    // Check critical tables exist
    const tableChecks = ['profiles', 'user_roles', 'certificates', 'documents'];
    for (const table of tableChecks) {
      try {
        const tableStart = Date.now();
        await supabase.from(table).select('count').limit(1);
        health.checks[`table_${table}`] = {
          status: 'healthy',
          responseTime: Date.now() - tableStart
        };
      } catch (error: unknown) {
        health.checks[`table_${table}`] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Table check failed'
        };
      }
    }

    // Environment variables check
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    health.checks.environment = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'unhealthy',
      missing_variables: missingEnvVars
    };

    // System resource checks
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    health.checks.system = {
      status: memUsageMB.heapUsed < 1000 ? 'healthy' : 'warning', // Warning if heap > 1GB
      memory_mb: memUsageMB,
      uptime_seconds: Math.round(process.uptime()),
      node_version: process.version
    };

    // Overall health determination
    const unhealthyChecks = Object.values(health.checks).filter(
      (check: unknown) => (check as Record<string, unknown>).status === 'unhealthy'
    );
    
    if (unhealthyChecks.length > 0) {
      health.status = 'unhealthy';
    } else {
      const warningChecks = Object.values(health.checks).filter(
        (check: unknown) => (check as Record<string, unknown>).status === 'warning'
      );
      if (warningChecks.length > 0) {
        health.status = 'warning';
      }
    }

    health.checks.overall = {
      status: health.status,
      total_response_time: Date.now() - startTime,
      checks_performed: Object.keys(health.checks).length
    };

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'warning' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });

  } catch (error: unknown) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      checks: {
        overall: {
          status: 'unhealthy',
          error: 'Health check failed',
          response_time: Date.now() - startTime
        }
      }
    }, { status: 503 });
  }
}



