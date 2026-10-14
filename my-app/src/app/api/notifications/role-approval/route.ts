import { NextResponse } from 'next/server';

/**
 * GONE: this legacy endpoint approved/rejected role requests with no
 * organization scoping or integrity checks and had no callers.
 * Use POST /api/admin/role-requests/[id]/approve or /deny instead.
 */
const gone = () =>
  NextResponse.json(
    {
      error: 'This endpoint has been removed. Use /api/admin/role-requests/{id}/approve or /deny.',
    },
    { status: 410 }
  );

export const POST = gone;
export const GET = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
