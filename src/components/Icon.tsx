import { Component, JSX } from 'solid-js';

const PATHS = {
  back: 'M15 18l-6-6 6-6',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  sound: 'M11 5L6 9H3v6h3l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13',
  play: 'M7 4.5v15l12-7.5-12-7.5z',
  pause: 'M7 5h3.5v14H7z M13.5 5H17v14h-3.5z',
  replay: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  hint: 'M9 18h6 M10 22h4 M12 2a6 6 0 0 0-3.2 11.1c.7.6 1.2 1.4 1.2 2.4h4c0-1 .5-1.8 1.2-2.4A6 6 0 0 0 12 2z',
  brush:
    'M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8 8.2 13 18.4 2.6z M7.5 14.5c-1.9 0-3.5 1.6-3.5 3.5 0 1.2-.8 2-2 2 1 1.3 2.6 2 4 2a4 4 0 0 0 4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12 M18 6L6 18',
  shuffle: 'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff:
    'M3 3l18 18 M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1 M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  cards: 'M8 3h11a2 2 0 0 1 2 2v12 M4 7h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z',
  flame:
    'M12 22c4 0 7-2.7 7-6.6 0-3.1-1.9-5.6-3.6-7.4-.4 1.9-1.4 3.2-2.7 3.7.4-3.6-1.3-6.9-4.2-8.7.3 3.2-1.4 5.3-2.9 7.1C4.4 11.6 5 13.5 5 15.4 5 19.3 8 22 12 22z',
  flip: 'M17 2l4 4-4 4 M3 11V9a3 3 0 0 1 3-3h15 M7 22l-4-4 4-4 M21 13v2a3 3 0 0 1-3 3H3',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  style?: JSX.CSSProperties;
}

const Icon: Component<IconProps> = (props) => (
  <svg
    width={props.size ?? 20}
    height={props.size ?? 20}
    viewBox="0 0 24 24"
    fill={props.name === 'play' || props.name === 'pause' ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={props.class}
    style={props.style}
    aria-hidden="true"
  >
    <path d={PATHS[props.name]} />
  </svg>
);

export default Icon;
