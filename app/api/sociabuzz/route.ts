import { NextResponse } from 'next/server';

/**
 * Legacy endpoint — webhook URLs are now user-scoped.
 * New format: /api/sociabuzz/{uid}
 */
export async function GET() {
  return NextResponse.json({
    status: 'deprecated',
    message: 'Webhook URL has changed. Update Sociabuzz to use: /api/sociabuzz/{your_uid}',
  }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({
    success: false,
    message: 'Webhook URL has changed. Update Sociabuzz to use: /api/sociabuzz/{your_uid}',
  }, { status: 410 });
}
