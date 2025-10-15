import { success } from '@/lib/api';

export async function GET() {
  return success({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: 'connected',
      api: 'running',
      ocr: 'available',
      vc: 'available'
    }
  });
}
