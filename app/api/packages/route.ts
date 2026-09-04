import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../lib/require-streamer';
import {
  createPackage,
  listPackages,
  validatePackageInput,
} from '../../../lib/admin/packages-repo';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/** GET /api/packages — the caller's own packages, including disabled ones. */
export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  const packages = await listPackages(streamer.streamerId);
  return NextResponse.json({ success: true, packages });
});

/** POST /api/packages — create a package in the caller's own workspace. */
export const POST = withStreamer(async (req: NextRequest, { streamer }) => {
  const body = await req.json().catch(() => null);
  const validated = validatePackageInput(body);
  if (!validated.ok) {
    return NextResponse.json({ success: false, error: validated.message }, { status: 400 });
  }

  const result = await createPackage(streamer.streamerId, validated.value);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 409 });
  }

  return NextResponse.json({ success: true, packageId: result.packageId }, { status: 201 });
});
