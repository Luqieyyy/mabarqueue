import { NextRequest, NextResponse } from 'next/server';
import { requireStreamer } from '../../../../lib/require-streamer';
import { AuthError } from '../../../../lib/require-auth';
import {
  deletePackage,
  updatePackage,
  validatePackageInput,
} from '../../../../lib/admin/packages-repo';

/**
 * Dynamic routes receive their params as a second argument, which the
 * `withStreamer` wrapper doesn't forward, so these handlers call
 * `requireStreamer` directly and map errors themselves.
 *
 * The package is always addressed as `streamers/{callerWorkspace}/packages/{id}`,
 * so an ID belonging to another streamer simply isn't found — ownership is
 * enforced by the path, not by trusting anything in the request.
 */
function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  console.error('[packages/:id] Unhandled error:', err);
  return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { streamer } = await requireStreamer(req);
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const validated = validatePackageInput(body);
    if (!validated.ok) {
      return NextResponse.json({ success: false, error: validated.message }, { status: 400 });
    }

    const updated = await updatePackage(streamer.streamerId, id, validated.value);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { streamer } = await requireStreamer(req);
    const { id } = await params;

    const deleted = await deletePackage(streamer.streamerId, id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
