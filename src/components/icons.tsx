import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const paths = {
  blank: [<path key="blank" d="M12 12h.01" opacity="0" />],
  albums: [
    <circle key="disc" cx="12" cy="12" r="8" />,
    <circle key="center" cx="12" cy="12" r="2" />,
    <path key="shine" d="M12 4a8 8 0 0 1 8 8" />,
  ],
  arrowLeft: [<path key="arrow" d="m15 18-6-6 6-6" />],
  chevronDown: [<path key="chevron" d="m7 10 5 5 5-5" />],
  chevronRight: [<path key="chevron" d="m10 7 5 5-5 5" />],
  chevronUp: [<path key="chevron" d="m7 14 5-5 5 5" />],
  check: [<path key="check" d="m5 12 4 4 10-10" />],
  clearSelection: [
    <path key="box" d="M5 5h14v14H5z" />,
    <path key="x1" d="m9 9 6 6" />,
    <path key="x2" d="m15 9-6 6" />,
  ],
  close: [
    <path key="a" d="M18 6 6 18" />,
    <path key="b" d="m6 6 12 12" />,
  ],
  copy: [
    <rect key="back" x="8" y="8" width="11" height="11" rx="2" />,
    <path key="front" d="M5 16V7a2 2 0 0 1 2-2h9" />,
  ],
  feedback: [
    <path key="bubble" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    <path key="line" d="M8 10h8" />,
    <path key="line2" d="M8 14h5" />,
  ],
  fullscreen: [
    <path key="topLeftH" d="M4 9V4h5" />,
    <path key="topLeftD" d="m4 4 6 6" />,
    <path key="topRightH" d="M20 9V4h-5" />,
    <path key="topRightD" d="m20 4-6 6" />,
    <path key="bottomLeftH" d="M4 15v5h5" />,
    <path key="bottomLeftD" d="m4 20 6-6" />,
    <path key="bottomRightH" d="M20 15v5h-5" />,
    <path key="bottomRightD" d="m20 20-6-6" />,
  ],
  fullscreenExit: [
    <path key="topLeftH" d="M9 4v5H4" />,
    <path key="topLeftD" d="m9 9-6-6" />,
    <path key="topRightH" d="M15 4v5h5" />,
    <path key="topRightD" d="m15 9 6-6" />,
    <path key="bottomLeftH" d="M9 20v-5H4" />,
    <path key="bottomLeftD" d="m9 15-6 6" />,
    <path key="bottomRightH" d="M15 20v-5h5" />,
    <path key="bottomRightD" d="m15 15 6 6" />,
  ],
  grip: [
    <circle key="a1" cx="8" cy="6" r="1" fill="currentColor" stroke="none" />,
    <circle key="a2" cx="12" cy="6" r="1" fill="currentColor" stroke="none" />,
    <circle key="a3" cx="16" cy="6" r="1" fill="currentColor" stroke="none" />,
    <circle key="b1" cx="8" cy="12" r="1" fill="currentColor" stroke="none" />,
    <circle key="b2" cx="12" cy="12" r="1" fill="currentColor" stroke="none" />,
    <circle key="b3" cx="16" cy="12" r="1" fill="currentColor" stroke="none" />,
    <circle key="c1" cx="8" cy="18" r="1" fill="currentColor" stroke="none" />,
    <circle key="c2" cx="12" cy="18" r="1" fill="currentColor" stroke="none" />,
    <circle key="c3" cx="16" cy="18" r="1" fill="currentColor" stroke="none" />,
  ],
  folder: [
    <path key="tab" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" />,
    <path key="body" d="M3 10h18l-2 9H5z" />,
  ],
  hiddenFolders: [
    <path key="tab" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" />,
    <path key="body" d="M3 10h18l-2 9H5z" />,
    <path key="slash" d="M4 4l16 16" />,
  ],
  heart: [
    <path
      key="heart"
      d="M20.8 7.6a5.1 5.1 0 0 0-7.2 0L12 9.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 22l8.8-7.2a5.1 5.1 0 0 0 0-7.2z"
    />,
  ],
  heartFilled: [
    <path
      key="heart-filled"
      d="M12 21.3 4.6 14.4a5.2 5.2 0 0 1-.4-7.3 4.7 4.7 0 0 1 6.9 0l.9.9.9-.9a4.7 4.7 0 0 1 6.9 0 5.2 5.2 0 0 1-.4 7.3z"
      fill="currentColor"
      stroke="none"
    />,
  ],
  info: [
    <circle key="circle" cx="12" cy="12" r="9" />,
    <path key="line" d="M12 11v5" />,
    <path key="dot" d="M12 8h.01" />,
  ],
  local: [
    <path key="drive" d="M4 14h16l-2-8H6z" />,
    <path key="base" d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />,
    <path key="dot" d="M7 17h.01" />,
  ],
  menu: [
    <path key="a" d="M4 7h16" />,
    <path key="b" d="M4 12h16" />,
    <path key="c" d="M4 17h16" />,
  ],
  moreHorizontal: [
    <circle key="a" cx="5" cy="12" r="1" />,
    <circle key="b" cx="12" cy="12" r="1" />,
    <circle key="c" cx="19" cy="12" r="1" />,
  ],
  next: [
    <path key="play" d="m8 5 8 7-8 7z" />,
    <path key="bar" d="M18 5v14" />,
  ],
  nowPlaying: [
    <path key="list1" d="M4 7h9" />,
    <path key="list2" d="M4 12h7" />,
    <path key="list3" d="M4 17h5" />,
    <path key="note" d="M16 6v10.5a2.5 2.5 0 1 1-1.5-2.3V8l5-1.5v8a2.5 2.5 0 1 1-1.5-2.3V6z" />,
  ],
  playlists: [
    <path key="a" d="M4 6h12" />,
    <path key="b" d="M4 11h12" />,
    <path key="c" d="M4 16h8" />,
    <path key="note" d="M18 10v7a2 2 0 1 1-1.2-1.8V11z" />,
  ],
  plus: [
    <path key="h" d="M5 12h14" />,
    <path key="v" d="M12 5v14" />,
  ],
  play: [<path key="play" d="M8 5v14l11-7z" fill="currentColor" stroke="none" />],
  pause: [
    <path key="left" d="M8 5v14" />,
    <path key="right" d="M16 5v14" />,
  ],
  previous: [
    <path key="bar" d="M6 5v14" />,
    <path key="play" d="m16 5-8 7 8 7z" />,
  ],
  recent: [
    <path key="clock" d="M3 12a9 9 0 1 0 3-6.7" />,
    <path key="back" d="M3 4v5h5" />,
    <path key="hands" d="M12 7v5l3 2" />,
  ],
  refresh: [
    <path key="top" d="M20 6v5h-5" />,
    <path key="topLine" d="M20 11a8 8 0 0 0-14.9-4" />,
    <path key="bottom" d="M4 18v-5h5" />,
    <path key="bottomLine" d="M4 13a8 8 0 0 0 14.9 4" />,
  ],
  refreshClock: [
    <path key="clock" d="M3 12a9 9 0 1 0 3-6.7" />,
    <path key="back" d="M3 4v5h5" />,
    <path key="hand1" d="M12 7v5" />,
    <path key="hand2" d="m12 12 3 2" />,
  ],
  repeat: [
    <path key="top" d="m17 2 4 4-4 4" />,
    <path key="topLine" d="M3 11V9a3 3 0 0 1 3-3h15" />,
    <path key="bottom" d="m7 22-4-4 4-4" />,
    <path key="bottomLine" d="M21 13v2a3 3 0 0 1-3 3H3" />,
  ],
  star: [
    <path
      key="star"
      d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"
    />,
  ],
  repeatOne: [
    <path key="top" d="m17 2 4 4-4 4" />,
    <path key="topLine" d="M3 11V9a3 3 0 0 1 3-3h15" />,
    <path key="bottom" d="m7 22-4-4 4-4" />,
    <path key="bottomLine" d="M21 13v2a3 3 0 0 1-3 3H3" />,
    <path key="one" d="M12 10v5" />,
    <path key="oneTop" d="m10.8 11 1.2-1 1.2 1" />,
  ],
  search: [
    <circle key="circle" cx="11" cy="11" r="7" />,
    <path key="handle" d="m20 20-4-4" />,
  ],
  settings: [
    <circle key="center" cx="12" cy="12" r="3" />,
    <path
      key="gear"
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    />,
  ],
  shuffle: [
    <path key="a" d="M16 3h5v5" />,
    <path key="b" d="M4 20 21 3" />,
    <path key="c" d="M21 16v5h-5" />,
    <path key="d" d="m15 15 6 6" />,
    <path key="e" d="M4 4l5 5" />,
  ],
  selectAll: [
    <path key="box" d="M4 4h16v16H4z" />,
    <path key="check" d="m8 12 3 3 5-6" />,
  ],
  songs: [
    <path key="note" d="M9 18V5l10-2v13" />,
    <circle key="left" cx="7" cy="18" r="3" />,
    <circle key="right" cx="17" cy="16" r="3" />,
  ],
  sort: [
    <path key="top" d="M4 7h10" />,
    <path key="topArrow" d="m11 4 3 3-3 3" />,
    <path key="bottom" d="M20 17H10" />,
    <path key="bottomArrow" d="m13 14-3 3 3 3" />,
  ],
  trash: [
    <path key="lid" d="M4 7h16" />,
    <path key="can" d="M6 7l1 14h10l1-14" />,
    <path key="handle" d="M9 7V4h6v3" />,
    <path key="left" d="M10 11v6" />,
    <path key="right" d="M14 11v6" />,
  ],
  voice: [
    <path key="body" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />,
    <path key="stand" d="M19 11a7 7 0 0 1-14 0" />,
    <path key="stem" d="M12 18v3" />,
    <path key="base" d="M8 21h8" />,
  ],
  volume: [
    <path key="speaker" d="M4 10v4h4l5 4V6l-5 4z" />,
    <path key="wave1" d="M16 9.5a4 4 0 0 1 0 5" />,
    <path key="wave2" d="M18.5 7a8 8 0 0 1 0 10" />,
  ],
  volumeMuted: [
    <path key="speaker" d="M4 10v4h4l5 4V6l-5 4z" />,
    <path key="x1" d="m18 9-4 4" />,
    <path key="x2" d="m14 9 4 4" />,
  ],
  users: [
    <path key="user1" d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />,
    <circle key="head1" cx="9.5" cy="7" r="4" />,
    <path key="user2" d="M22 21v-2a4 4 0 0 0-3-3.9" />,
    <path key="head2" d="M16 3.1a4 4 0 0 1 0 7.8" />,
  ],
} as const

export type IconName = keyof typeof paths

export function Icon({ name, className, ...props }: IconProps & { name: IconName }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
