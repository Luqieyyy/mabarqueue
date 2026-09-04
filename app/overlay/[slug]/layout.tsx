// Overlay-specific layout: transparent wrapper for OBS browser source.
// Root layout already provides <html>/<body>, so this just adds a transparent wrapper.
export default function OverlaySlugLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'transparent' }}>{children}</div>;
}
