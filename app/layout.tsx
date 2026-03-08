import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MabarQueue – Stream Queue Manager',
  description: 'Real-time viewer game queue management for livestreamers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        No background on body — each page sets its own.
        This keeps /overlay transparent for OBS.
      */}
      <body className="antialiased text-white">{children}</body>
    </html>
  );
}
