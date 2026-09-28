/**
 * Health Check Endpoint
 * GET /api/health
 * 
 * Returns comprehensive environment and feature status
 * Used for monitoring and debugging
 */

import { NextResponse } from 'next/server';
import { performHealthCheck } from '@/lib/runtimeEnvCheck';
import { success } from '@/lib/api';

export async function GET() {
  try {
    const healthCheck = performHealthCheck();

    // In production expose only overall status; configuration details are not public
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { healthy: healthCheck.healthy, timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }

    // Return success with health data
    return success({
      ...healthCheck,
      version: '1.0.0',
    }, healthCheck.healthy ? 'System is healthy' : 'System has issues');
  } catch (error) {
    return NextResponse.json(
      {
        healthy: false,
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString(),
        error: process.env.NODE_ENV === 'production' ? 'Health check failed' : (error instanceof Error ? error.message : 'Health check failed'),
        version: '1.0.0',
      },
      { status: 503 }
    );
  }
}
