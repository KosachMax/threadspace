import type { CSSProperties } from "react";
const paths = {
  chevron: <path d="m7 4 5 5-5 5" />,
  page: <><path d="M10 2H4v14h11V7l-5-5Z"/><path d="M10 2v5h5M7 10h5M7 13h4"/></>,
  code: <><path d="m6 4-5 5 5 5m6-10 5 5-5 5M10 3 8 15"/></>,
  question: <><path d="M14 2.5H4A2.5 2.5 0 0 0 1.5 5v5A2.5 2.5 0 0 0 4 12.5h1V16l4-3.5h5a2.5 2.5 0 0 0 2.5-2.5V5A2.5 2.5 0 0 0 14 2.5Z"/><path d="M7.3 6a1.8 1.8 0 1 1 2.8 1.5C9.3 8 9 8.1 9 9"/><circle cx="9" cy="10.4" r=".5" fill="currentColor" stroke="none"/></>,
  warning: <><path d="M8.1 2.8a1 1 0 0 1 1.8 0l6.7 11.6a1 1 0 0 1-.9 1.5H2.3a1 1 0 0 1-.9-1.5L8.1 2.8Z"/><path d="M9 6.2v4.3"/><circle cx="9" cy="13" r=".7" fill="currentColor" stroke="none"/></>,
  clock: <><circle cx="9" cy="9" r="6.7"/><path d="M9 4.8V9l3 1.7"/></>,
  folder: <path d="M2 4h5l2 2h7v9H2V4Z"/>,
  plus: <path d="M9 3v12M3 9h12"/>,
  archive: <><rect x="2" y="2" width="14" height="4" rx="1"/><path d="M3 6v10h12V6M7 9h4"/></>,
  dots: <><circle cx="4" cy="9" r=".8"/><circle cx="9" cy="9" r=".8"/><circle cx="14" cy="9" r=".8"/></>,
  search: <><circle cx="8" cy="8" r="5"/><path d="m12 12 4 4"/></>,
  star: <path d="m9 1 2.4 5 5.6.8-4 3.9.9 5.5L9 13.6l-4.9 2.6.9-5.5-4-3.9L6.6 6 9 1Z"/>,
  sun: <><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3 3l1.4 1.4m9.2 9.2L15 15M3 15l1.4-1.4m9.2-9.2L15 3"/></>,
  moon: <path d="M15 11A7 7 0 0 1 7 3a7 7 0 1 0 8 8Z"/>,
  system: <><rect x="2" y="2" width="14" height="10" rx="1"/><path d="M9 12v4M5 16h8"/></>,
  close: <path d="m4 4 10 10M14 4 4 14"/>,
  check: <path d="m3 9 4 4 8-9"/>,
  restore: <><path d="M3 8a6 6 0 1 1 1 6M3 3v5h5"/></>,
  pin: <g transform="rotate(45 9 9) translate(1.5 1.5) scale(.625)"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></g>,
  pencil: <><path d="m12 2 4 4-9 9H3v-4l9-9ZM10 4l4 4"/></>,
  random: <><path d="M2 4h3l8 10h3M13 11l3 3-3 3M2 14h3l3-4m2-3 3-3h3m-3-3 3 3-3 3"/></>,
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, className, style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
