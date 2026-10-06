import type { ReactNode } from 'react';

/**
 * Small stroke icons, drawn inline so the app needs no icon dependency and
 * works offline on a demo machine. All share one 24px grid and stroke style.
 */
const PATHS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  report: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  list: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.5 5h11L20 13.5" />
      <path d="M4 13.5V19h16v-5.5h-5l-1 2h-4l-1-2H4Z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.8 2.8L16.3 9.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 17a8.5 8.5 0 1 1 16 0" />
      <path d="m12 17 3.5-5" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0 4.9 4.9L9 21.8a2.1 2.1 0 0 1-3-3L16.5 8.4" />
      <path d="m14.5 6.5 2-2 3 3-2 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19.5 6v6c0 4.2-3 7.2-7.5 8.5C7.5 19.2 4.5 16.2 4.5 12V6L12 3.5Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  arrowUp: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5v-9M8.5 11 12 7.5l3.5 3.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.6-3.7 3.4-5.5 7-5.5s6.4 1.8 7 5.5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4-5.5-1.8L10.2 9 12 3.5Z" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
