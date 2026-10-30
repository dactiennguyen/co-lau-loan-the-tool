// One SVG icon set: 24 × 24, 2 px round strokes in the current colour (a few glyphs are filled). Icons beside visible text
// are hidden from screen readers; icon-only buttons carry their own label.
import type { ReactElement } from "react";

const filled = { fill: "currentColor", stroke: "none" } as const;

const paths = {
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5M15 12H3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  play: <path {...filled} d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />,
  stop: <rect {...filled} x="6" y="6" width="12" height="12" rx="2" />,
  bolt: <path {...filled} d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  flag: (
    <>
      <path d="M5 21V4" />
      <path {...filled} d="M5 4c5-3 9 3 14 0v9c-5 3-9-3-14 0z" />
    </>
  ),
  sword: <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />,
  crown: (
    <>
      <path {...filled} d="m3 17 1.6-10 4.9 4.2L12 4l2.5 7.2L19.4 7 21 17z" />
      <rect {...filled} x="3" y="18.5" width="18" height="2" rx="1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 7.2a4.9 4.9 0 0 1 9.2 3.4C19.5 15.4 12 20 12 20z" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9M14.8 9.6c-.4-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 1.9 0 2.6 5.8 1.3 5.8 3.9 0 1.1-1.2 1.9-2.9 1.9-1.4 0-2.6-.6-2.9-1.6" />
    </>
  ),
  gem: <path d="M6 3h12l3.5 6L12 21 2.5 9zM2.5 9h19M9 3l3 6 3-6M12 9v12" />,
  shield: <path d="M12 3 20 6v6c0 4.6-3.4 8.1-8 9-4.6-.9-8-4.4-8-9V6z" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
    </>
  ),
  wind: <path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h7" />,
  flame: <path d="M12 3s5.5 4.2 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.3 1.1-4 2.3-5 0 2.1 1 3.3 2.2 3.3 0-3.3 1-5.6 1-7.8z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
