import {
  AddRegular,
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ArrowRepeat1Regular,
  ArrowRepeatAllRegular,
  ArrowShuffleRegular,
  ArrowSortRegular,
  ArrowSyncRegular,
  ArrowUndoRegular,
  AppsListDetailRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
  ChatRegular,
  ClockRegular,
  CommentTextRegular,
  CopyRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  EyeRegular,
  FolderRegular,
  FolderProhibitedRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
  GridDotsRegular,
  HardDriveRegular,
  HeartFilled,
  HeartRegular,
  ImageRegular,
  InfoRegular,
  LibraryRegular,
  LineHorizontal3Regular,
  MicRegular,
  MoreHorizontalRegular,
  MultiselectLtrRegular,
  MusicNote2Regular,
  NextRegular,
  PauseRegular,
  PeopleRegular,
  PictureInPictureEnterRegular,
  PlayRegular,
  PreviousRegular,
  SaveRegular,
  SearchRegular,
  SelectAllOnRegular,
  SettingsRegular,
  StarRegular,
  type FluentIconsProps,
} from '@fluentui/react-icons'
import type { ComponentType, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>
type FluentIconComponent = ComponentType<FluentIconsProps>

const paths = {
  blank: [<path key="blank" d="M12 12h.01" opacity="0" />],
  albums: [
    <circle key="outer" cx="12" cy="12" r="8" />,
    <circle key="inner" cx="12" cy="12" r="3" />,
    <circle key="pin" cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" />,
  ],
  arrowLeft: [<path key="arrow" d="m15 18-6-6 6-6" />],
  arrowRight: [
    <path key="line" d="M6 12h11" />,
    <path key="head" d="m13 7 5 5-5 5" />,
  ],
  chevronDown: [<path key="chevron" d="m7 10 5 5 5-5" />],
  chevronRight: [<path key="chevron" d="m10 7 5 5-5 5" />],
  chevronUp: [<path key="chevron" d="m7 14 5-5 5 5" />],
  check: [<path key="check" d="m5 12 4 4 10-10" />],
  clearSelection: [
    <path key="box" d="M4 4h6M14 4h6M20 4v6M20 14v6M20 20h-6M10 20H4M4 20v-6M4 10V4" />,
  ],
  clear: [
    <path key="list1" d="M5 7h10" />,
    <path key="list2" d="M5 12h7" />,
    <path key="list3" d="M5 17h5" />,
    <path key="x1" d="m16 14 4 4" />,
    <path key="x2" d="m20 14-4 4" />,
  ],
  close: [
    <path key="a" d="M18 6 6 18" />,
    <path key="b" d="m6 6 12 12" />,
  ],
  copy: [
    <rect key="back" x="8" y="8" width="11" height="11" rx="2" />,
    <path key="front" d="M5 16V7a2 2 0 0 1 2-2h9" />,
  ],
  edit: [
    <path key="body" d="M4 20h4l10.8-10.8a2.1 2.1 0 0 0-3-3L5 17z" />,
    <path key="tip" d="m14.5 7.5 3 3" />,
    <path key="line" d="M13 20h7" />,
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
  grid: [
    <rect key="topLeft" x="5.25" y="5.25" width="5.35" height="5.35" rx="0.95" />,
    <rect key="topRight" x="13.4" y="5.25" width="5.35" height="5.35" rx="0.95" />,
    <rect key="bottomLeft" x="5.25" y="13.4" width="5.35" height="5.35" rx="0.95" />,
    <rect key="bottomRight" x="13.4" y="13.4" width="5.35" height="5.35" rx="0.95" />,
  ],
  folder: [
    <path key="body" d="M3.5 7.5a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />,
    <path key="top" d="M3.5 10h17" />,
  ],
  hiddenFolders: [
    <path key="body" d="M3.5 7.5a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />,
    <path key="top" d="M3.5 10h17" />,
    <path key="slash" d="M4.5 4.5 19.5 19.5" />,
  ],
  lock: [
    <rect key="body" x="5" y="10" width="14" height="10" rx="2" />,
    <path key="shackle" d="M8 10V8a4 4 0 0 1 8 0v2" />,
  ],
  unlock: [
    <rect key="body" x="5" y="10" width="14" height="10" rx="2" />,
    <path key="shackle" d="M8 10V8a4 4 0 0 1 7.5-2" />,
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
    <path key="drive" d="M5.5 5.5h13l2 7h-17z" />,
    <path key="base" d="M3.5 12.5h17v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
    <path key="dot" d="M7 16h.01" />,
  ],
  lyrics: [
    <path key="bubble" d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-12a2 2 0 0 1 2-2z" />,
    <path key="line1" d="M9 10h7" />,
    <path key="line2" d="M9 13h5" />,
  ],
  musicLibrary: [
    <path key="book1" d="M5 5v14" />,
    <path key="book2" d="M10 4.5v15" />,
    <path key="book3" d="M15 5v14" />,
    <path key="book4" d="m19 6 2 12" />,
  ],
  menu: [
    <path key="a" d="M4 7h16" />,
    <path key="b" d="M4 12h16" />,
    <path key="c" d="M4 17h16" />,
  ],
  miniMode: [
    <rect key="outer" x="3.5" y="5" width="17" height="14" rx="2" />,
    <rect key="inner" x="11.5" y="11.5" width="6" height="4.5" rx="1" />,
  ],
  multiSelect: [
    <path key="check1" d="m4.5 7.5 1.7 1.7L9.2 6" />,
    <path key="check2" d="m4.5 16.5 1.7 1.7 3-3.2" />,
    <path key="line1" d="M12 7.5h8" />,
    <path key="line2" d="M12 16.5h8" />,
  ],
  moreHorizontal: [
    <circle key="a" cx="5" cy="12" r="1" />,
    <circle key="b" cx="12" cy="12" r="1" />,
    <circle key="c" cx="19" cy="12" r="1" />,
  ],
  next: [
    <path key="play" d="m8 6 7.5 6L8 18z" />,
    <path key="bar" d="M18 6v12" />,
  ],
  nowPlaying: [
    <path key="list1" d="M4 7h8" />,
    <path key="list2" d="M4 12h7" />,
    <path key="list3" d="M4 17h5" />,
    <path key="noteStem" d="M17 5.5v9.8" />,
    <path key="noteHead" d="M17 15.3a2.4 2.4 0 1 1-1.6-2.3" />,
  ],
  playlists: [
    <path key="list1" d="M4 6.5h10" />,
    <path key="list2" d="M4 11.5h9" />,
    <path key="list3" d="M4 16.5h6" />,
    <path key="stem" d="M18 8.5v8" />,
    <circle key="head" cx="16" cy="17" r="2" />,
  ],
  pictures: [
    <rect key="frame" x="3" y="5" width="18" height="14" rx="2" />,
    <circle key="sun" cx="8" cy="10" r="1.5" />,
    <path key="mountain" d="m5 17 4.5-4.5 3.5 3.5 2-2 4 4" />,
  ],
  plus: [
    <path key="h" d="M5 12h14" />,
    <path key="v" d="M12 5v14" />,
  ],
  play: [<path key="play" d="M8 5v14l11-7z" fill="currentColor" stroke="none" />],
  pause: [
    <rect key="left" x="7.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />,
    <rect key="right" x="13" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />,
  ],
  playNext: [
    <path key="line" d="M6 5.5h12" />,
    <path key="stem" d="M12 18.5v-10" />,
    <path key="head" d="m7.8 12.6 4.2-4.2 4.2 4.2" />,
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
  rename: [
    <path key="body" d="M4 20h4l10.8-10.8a2.1 2.1 0 0 0-3-3L5 17z" />,
    <path key="tip" d="m14.5 7.5 3 3" />,
    <path key="line" d="M13 20h7" />,
  ],
  refresh: [
    <path key="top" d="M19 5v5h-5" />,
    <path key="topLine" d="M18.6 10A7 7 0 0 0 6.5 6.5" />,
    <path key="bottom" d="M5 19v-5h5" />,
    <path key="bottomLine" d="M5.4 14a7 7 0 0 0 12.1 3.5" />,
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
  dice: [
    <rect key="body" x="4" y="4" width="16" height="16" rx="3.5" />,
    <circle key="dot1" cx="8.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />,
    <circle key="dot2" cx="15.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />,
    <circle key="dot3" cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />,
    <circle key="dot4" cx="8.5" cy="15.5" r="0.9" fill="currentColor" stroke="none" />,
    <circle key="dot5" cx="15.5" cy="15.5" r="0.9" fill="currentColor" stroke="none" />,
  ],
  save: [
    <path key="body" d="M5 4h12l2 2v14H5z" />,
    <path key="slot" d="M8 4v6h8V4" />,
    <path key="label" d="M8 15h8v5H8z" />,
  ],
  settings: [
    <circle key="center" cx="12" cy="12" r="3" />,
    <path
      key="gear"
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    />,
  ],
  shuffle: [
    <path key="topLine" d="M4 7h2.2c2.2 0 3.4 2 5.2 5s3 5 5.4 5H20" />,
    <path key="bottomLine" d="M4 17h2.2c2 0 3.2-1.7 4.7-4.2" />,
    <path key="topExit" d="M14.1 9.2C15 7.8 15.9 7 17.3 7H20" />,
    <path key="arrowTop" d="m17 4 3 3-3 3" />,
    <path key="arrowBottom" d="m17 14 3 3-3 3" />,
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
  invertSelection: [
    <path key="curve" d="M20 7c0 4-3 7-8 7H7" />,
    <path key="head" d="M10 12l-3 2 3 2" />,
  ],
  sort: [
    <path key="top" d="M4 7h11" />,
    <path key="topArrow" d="m12 4 3 3-3 3" />,
    <path key="bottom" d="M20 17H9" />,
    <path key="bottomArrow" d="m12 14-3 3 3 3" />,
  ],
  trash: [
    <path key="lid" d="M4 7h16" />,
    <path key="can" d="M6 7l1 14h10l1-14" />,
    <path key="handle" d="M9 7V4h6v3" />,
    <path key="left" d="M10 11v6" />,
    <path key="right" d="M14 11v6" />,
  ],
  undo: [
    <path key="arrow" d="M9 7H4v5" />,
    <path key="curve" d="M4 12a8 8 0 1 0 3-6" />,
  ],
  import: [
    <path key="box" d="M5 15v4h14v-4" />,
    <path key="line" d="M12 3v12" />,
    <path key="arrow" d="m7 10 5 5 5-5" />,
  ],
  voice: [
    <path key="body" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />,
    <path key="stand" d="M19 11a7 7 0 0 1-14 0" />,
    <path key="stem" d="M12 18v3" />,
    <path key="base" d="M8 21h8" />,
  ],
  volume: [
    <path key="speaker" d="M4.7 9.4q-.8 0-.8.8v3.6q0 .8.8.8h3.2l4.2 3.7q.9.8.9-.45V6.15q0-1.25-.9-.45L7.9 9.4z" />,
    <path key="wave1" d="M15.3 9.55a4.1 4.1 0 0 1 0 4.9" />,
    <path key="wave2" d="M17.6 7.55a7 7 0 0 1 0 8.9" />,
    <path key="wave3" d="M19.9 5.6a10 10 0 0 1 0 12.8" />,
  ],
  volumeOff: [
    <path key="speaker" d="M4.7 9.4q-.8 0-.8.8v3.6q0 .8.8.8h3.2l4.2 3.7q.9.8.9-.45V6.15q0-1.25-.9-.45L7.9 9.4z" />,
  ],
  volumeLow: [
    <path key="speaker" d="M4.7 9.4q-.8 0-.8.8v3.6q0 .8.8.8h3.2l4.2 3.7q.9.8.9-.45V6.15q0-1.25-.9-.45L7.9 9.4z" />,
    <path key="wave1" d="M15.3 9.55a4.1 4.1 0 0 1 0 4.9" />,
  ],
  volumeMedium: [
    <path key="speaker" d="M4.7 9.4q-.8 0-.8.8v3.6q0 .8.8.8h3.2l4.2 3.7q.9.8.9-.45V6.15q0-1.25-.9-.45L7.9 9.4z" />,
    <path key="wave1" d="M15.3 9.55a4.1 4.1 0 0 1 0 4.9" />,
    <path key="wave2" d="M17.6 7.55a7 7 0 0 1 0 8.9" />,
  ],
  volumeMuted: [
    <path key="speaker" d="M4.7 9.4q-.8 0-.8.8v3.6q0 .8.8.8h3.2l4.2 3.7q.9.8.9-.45V6.15q0-1.25-.9-.45L7.9 9.4z" />,
    <path key="x1" d="m20 10-4 4" />,
    <path key="x2" d="m16 10 4 4" />,
  ],
  users: [
    <path key="user1" d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />,
    <circle key="head1" cx="9.5" cy="7" r="4" />,
    <path key="user2" d="M22 21v-2a4 4 0 0 0-3-3.9" />,
    <path key="head2" d="M16 3.1a4 4 0 0 1 0 7.8" />,
  ],
  view: [
    <path key="eye" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />,
    <circle key="pupil" cx="12" cy="12" r="3" />,
  ],
} as const

export type IconName = keyof typeof paths

const fluentIcons: Partial<Record<IconName, FluentIconComponent>> = {
  arrowLeft: ArrowLeftRegular,
  chevronDown: ChevronDownRegular,
  chevronRight: ChevronRightRegular,
  chevronUp: ChevronUpRegular,
  check: CheckmarkRegular,
  clear: DismissRegular,
  close: DismissRegular,
  copy: CopyRegular,
  edit: EditRegular,
  feedback: ChatRegular,
  fullscreen: FullScreenMaximizeRegular,
  fullscreenExit: FullScreenMinimizeRegular,
  grip: GridDotsRegular,
  folder: FolderRegular,
  hiddenFolders: FolderProhibitedRegular,
  heart: HeartRegular,
  heartFilled: HeartFilled,
  info: InfoRegular,
  local: HardDriveRegular,
  lyrics: CommentTextRegular,
  miniMode: PictureInPictureEnterRegular,
  musicLibrary: LibraryRegular,
  menu: LineHorizontal3Regular,
  multiSelect: MultiselectLtrRegular,
  moreHorizontal: MoreHorizontalRegular,
  next: NextRegular,
  nowPlaying: AppsListDetailRegular,
  pictures: ImageRegular,
  plus: AddRegular,
  play: PlayRegular,
  pause: PauseRegular,
  previous: PreviousRegular,
  recent: ClockRegular,
  rename: EditRegular,
  refresh: ArrowSyncRegular,
  refreshClock: ArrowSyncRegular,
  repeat: ArrowRepeatAllRegular,
  repeatOne: ArrowRepeat1Regular,
  save: SaveRegular,
  search: SearchRegular,
  selectAll: SelectAllOnRegular,
  settings: SettingsRegular,
  shuffle: ArrowShuffleRegular,
  songs: MusicNote2Regular,
  sort: ArrowSortRegular,
  star: StarRegular,
  trash: DeleteRegular,
  undo: ArrowUndoRegular,
  import: ArrowDownloadRegular,
  voice: MicRegular,
  users: PeopleRegular,
  view: EyeRegular,
}

export function Icon({ name, className, ...props }: IconProps & { name: IconName }) {
  const FluentIcon = fluentIcons[name]
  const strokeWidth = name === 'albums' || name === 'playlists' || name === 'playNext'
    ? 1.35
    : name === 'grid'
      ? 1.45
    : name === 'dice'
      ? 1.55
    : name === 'invertSelection' || name === 'clearSelection'
      ? 1.25
    : name.startsWith('volume')
      ? 1.3
      : 2.2

  if (FluentIcon) {
    return (
      <FluentIcon
        className={className}
        aria-hidden="true"
        focusable="false"
        {...(props as FluentIconsProps)}
      />
    )
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
