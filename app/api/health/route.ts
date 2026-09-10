import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'property-maintenance-api',
    timestamp: new Date().toISOString(),
  });
}
