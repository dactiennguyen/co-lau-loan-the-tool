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
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      <path d="m11.2 11.8 9.3-9.3M17.5 5.5l3 3M14.5 8.5l2 2" />
    </>
  ),
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
  scroll: <path d="M8 3h11a2 2 0 0 1 2 2v2h-4M8 3a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 1 2-2M9.5 8h4.5M9.5 12h4.5" />,
  check: <path d="m5 12 5 5 9-10" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  yinyang: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9M12 7.5h.01M12 16.5h.01" />
    </>
  ),
  peach: (
    <>
      <path d="M12 8C7.5 6.5 4 9.5 4 14c0 4 3.6 7 8 7s8-3 8-7c0-4.5-3.5-7.5-8-6z" />
      <path d="M12 8c0-2.2 1.2-3.8 3.5-4.5M12 8C10.6 5.8 8.4 5.2 6.5 5.6 7.2 7.6 9.4 8.6 12 8" />
    </>
  ),
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  wallet: <path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3M16.5 13.5h.01" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <path d="M3 3l18 18M10.6 5.1Q11.3 5 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.1 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  ),
  swap: <path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  chart: <path d="M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4" />,
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  eraser: <path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9" />,
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  /** Xuất: the arrow of download turned up. */
  upload: <path d="M12 15V3M7 8l5-5 5 5M4 21h16" />,
  /** Nhập / Xuất JSON of the accounts: an arrow down and an arrow up, not the sideways ones of swap (Đổi map). */
  inout: <path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />,
  /** Sao chép: two sheets. */
  copy: <path d="M8 8h12v12H8zM16 8V4H4v12h4" />,
  cart: <path d="M3 4h2l2.2 10.4a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.5 8H6.2M9 20h.01M17 20h.01" />,
  // A stall under an awning: Chợ trời.
  market: <path d="M3 9 5 4h14l2 5M3 9h18M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8M10 20v-5h4v5" />,
  // An envelope: Hòm thư.
  mail: <path d="M3 5h18v14H3zM3 6l9 7 9-7" />,
  // A box with a ribbon and a bow: Mã quà tặng.
  gift: <path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10.5 4 7 3.5 7 6s3 2 5 2c2 0 5 .5 5-2s-3.5-2-5 2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </>
  ),
  hammer: <path d="M12 6l4-4 6 6-4 4zM15 9 4 20l-1.5-1.5L13.5 7.5" />,
  server: <path d="M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h4M12 17h4" />,
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  /** Đồ nam, đồ nữ (game/gender.ts). */
  male: (
    <>
      <circle cx="9.5" cy="14.5" r="5.5" />
      <path d="m13.5 10.5 6.5-6.5M15 4h5v5" />
    </>
  ),
  female: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M12 14.5V22M8.5 18.5h7" />
    </>
  ),
  /** Báo lỗi, Log lỗi. */
  bug: (
    <>
      <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5M8.5 3.5 10 5M15.5 3.5 14 5" />
      <path d="M12 20a6 6 0 0 1-6-6v-3a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 18 11v3a6 6 0 0 1-6 6zM12 20v-8" />
      <path d="M6 13H2.5M21.5 13H18M6.5 9 4 7.5M17.5 9 20 7.5M6.5 17.5 4 19M17.5 17.5 20 19" />
    </>
  ),
  /** Thu nhỏ vào khay: two arrows pointing in. */
  tray: <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />,
  /* A window with an arrow going out of it: opens a window of its own (Cửa sổ trận). */
  popout: <path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5" />,
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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
