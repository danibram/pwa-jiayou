import { Component, JSX } from 'solid-js';
import Icon from './Icon';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  right?: JSX.Element;
}

const TopBar: Component<TopBarProps> = (props) => (
  <header class="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-2 h-12 flex-shrink-0">
    <button
      onClick={props.onBack}
      class="btn-ghost h-11 px-2 -ml-2 justify-self-start gap-0.5"
      aria-label={props.backLabel ?? 'Volver'}
    >
      <Icon name="back" size={20} />
      <span class="text-sm font-medium">{props.backLabel ?? 'Volver'}</span>
    </button>
    <div class="text-center leading-tight min-w-0">
      <div class="font-display text-[1.0625rem] font-semibold truncate">{props.title}</div>
      {props.subtitle && <div class="text-xs text-ink-soft mt-0.5 truncate">{props.subtitle}</div>}
    </div>
    <div class="justify-self-end flex items-center justify-end min-h-11">{props.right}</div>
  </header>
);

export default TopBar;
