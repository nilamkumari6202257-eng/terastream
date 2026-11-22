import React from 'react';

/**
 * TeraStream brand mark: violet→fuchsia squircle with a white play triangle
 * and "stream" speed-lines cutting in from the left.
 */
export const BrandLogo: React.FC<{ className?: string }> = ({ className = 'h-10 w-10' }) => (
  <svg viewBox="0 0 64 64" className={className} role="img" aria-label="TeraStream logo">
    <defs>
      <linearGradient id="ts-brand-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7c3aed" />
        <stop offset="0.55" stopColor="#a855f7" />
        <stop offset="1" stopColor="#e879f9" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="18" fill="url(#ts-brand-g)" />
    {/* stream speed-lines */}
    <rect x="10" y="24.5" width="12" height="4.5" rx="2.25" fill="#fff" opacity="0.55" />
    <rect x="13.5" y="33" width="8.5" height="4.5" rx="2.25" fill="#fff" opacity="0.32" />
    {/* play triangle */}
    <path d="M30 20.5l17.5 11.5L30 43.5z" fill="#fff" />
  </svg>
);
