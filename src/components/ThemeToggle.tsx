import { Component, createSignal, Match, Switch } from 'solid-js';
import Icon from './Icon';
import { cycleTheme, themeLabel, themePreference } from '../utils/theme';

/** One tap cycles system → dark → light. The icon spins to mark the change. */
const ThemeToggle: Component<{ class?: string }> = (props) => {
  const [spin, setSpin] = createSignal(0);

  return (
    <button
      type="button"
      class={`btn-quiet h-10 w-10 shrink-0 p-0 text-ink-soft hover:text-ink ${props.class ?? ''}`}
      aria-label={`${themeLabel()}. Cambiar tema`}
      title={themeLabel()}
      onClick={() => {
        cycleTheme();
        setSpin((n) => n + 1);
      }}
    >
      <span
        class="inline-flex transition-transform duration-300 ease-out"
        style={{ transform: `rotate(${spin() * 360}deg)` }}
      >
        <Switch>
          <Match when={themePreference() === 'system'}>
            <Icon name="system" size={18} />
          </Match>
          <Match when={themePreference() === 'dark'}>
            <Icon name="moon" size={18} />
          </Match>
          <Match when={themePreference() === 'light'}>
            <Icon name="sun" size={18} />
          </Match>
        </Switch>
      </span>
    </button>
  );
};

export default ThemeToggle;
