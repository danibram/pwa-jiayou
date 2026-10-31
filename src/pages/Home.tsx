import { Component, createMemo, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import RiceGrid from '../components/RiceGrid';
import { characterStore } from '../stores/characterStore';
import { progressStore } from '../stores/progressStore';
import Pinyin from '../components/Pinyin';
import { spokenMeaning } from '../utils/meaning';
import type { ReviewPool } from './Entrenamiento';

export type HomeTarget =
  | { page: 'tarjetas' }
  | { page: 'temas' }
  | { page: 'acerca' }
  | { page: 'entrenamiento'; pool: ReviewPool }
  | { page: 'trazos'; char?: string };

interface HomeProps {
  onNavigate: (target: HomeTarget) => void;
}

const Home: Component<HomeProps> = (props) => {
  const levels = characterStore.getAvailableLevels();
  const stored = characterStore.state.selectedLevels.filter((l) => levels.includes(l));
  if (stored.length === 0) characterStore.selectLevel(levels[0]);
  else if (stored.length !== characterStore.state.selectedLevels.length) {
    characterStore.selectLevels(stored);
  }

  const levelLabel = () => characterStore.levelLabel();
  const chars = createMemo(() => characterStore.getCharactersByLevel());
  const daily = createMemo(() => characterStore.getDailyCharacter());
  const queue = createMemo(() => progressStore.buildQueue(chars()));
  const log = () => progressStore.daily;
  const pending = () => queue().due.length + queue().fresh.length;

  const todayLine = () => {
    const dueN = queue().due.length;
    const freshN = queue().fresh.length;
    if (dueN === 0 && freshN === 0) return `Hoy no queda nada en ${levelLabel()}.`;
    const review = `${dueN} para repasar`;
    const fresh = freshN === 1 ? '1 nuevo' : `${freshN} nuevos`;
    if (dueN === 0) return `Hoy, ${fresh} en ${levelLabel()}.`;
    if (freshN === 0) return `Hoy, ${review} en ${levelLabel()}.`;
    return `Hoy, ${review} y ${fresh} en ${levelLabel()}.`;
  };

  const todayAction = () => {
    const dueN = queue().due.length;
    const freshN = queue().fresh.length;
    if (dueN === 0) return `Aprender ${freshN}`;
    if (freshN === 0) return 'Empezar repaso';
    return 'Empezar';
  };

  const masteredIn = (lvl: number) =>
    characterStore.state.characters.filter(
      (c) => c.hsk_level === lvl && progressStore.isMastered(c.character)
    ).length;

  const pickLevel = (lvl: number) => characterStore.toggleLevel(lvl);

  const modes = [
    {
      glyph: '卡',
      title: 'Explorar',
      body: 'Tarjetas a tu ritmo',
      go: () => props.onNavigate({ page: 'tarjetas' }),
    },
    {
      glyph: '写',
      title: 'Escribir',
      body: 'Orden de trazos, con el dedo',
      go: () => {
        const q = queue();
        const first = q.due[0] ?? q.fresh[0];
        if (first) {
          const i = chars().findIndex((c) => c.character === first.character);
          if (i >= 0) characterStore.setCurrentIndex(i);
        }
        props.onNavigate({ page: 'trazos' });
      },
    },
    {
      glyph: '练',
      title: 'Todo lo marcado',
      body: 'Práctica libre',
      go: () => props.onNavigate({ page: 'entrenamiento', pool: 'all' }),
    },
    {
      glyph: '类',
      title: 'Temas',
      body: 'Verbos, familia, colores…',
      go: () => props.onNavigate({ page: 'temas' }),
    },
  ];

  return (
    <div
      class="mx-auto flex h-[100dvh] w-full max-w-[40rem] flex-col overflow-hidden px-4 pb-8"
      style={{ 'padding-top': 'max(env(safe-area-inset-top), 1.25rem)' }}
    >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Wordmark and streak */}
      <header class="flex items-center gap-3 animate-rise">
        <img src="/icon.svg" alt="" class="h-10 w-10 rounded-[0.7rem] shadow-lift rotate-[-3deg]" />
        <div class="leading-tight flex-1">
          <div class="font-sans text-[1.375rem] font-semibold tracking-tight">Jiāyóu</div>
          <div class="text-xs text-ink-faint">Caracteres chinos HSK</div>
        </div>
        <Show when={log().streak > 0}>
          <div
            class="flex items-center h-8 px-3 rounded-full border border-line text-sm font-medium text-ink-soft tabular-nums"
            aria-label={`Racha de ${log().streak} ${log().streak === 1 ? 'día' : 'días'}`}
          >
            {log().streak} {log().streak === 1 ? 'día' : 'días'}
          </div>
        </Show>
      </header>

      {/* Today */}
      <section class="sheet mt-6 p-5 animate-rise [animation-delay:60ms]">
        <p class="font-display text-[1.65rem] font-semibold leading-snug text-balance">
          {todayLine()}
        </p>
        <p class="mt-1 text-sm text-ink-soft tabular-nums">
          {chars().filter((c) => progressStore.isMastered(c.character)).length} de {chars().length} sabidos
        </p>
        <div class="mt-2 flex h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            class="h-full bg-ink/50"
            style={{
              width: `${chars().length ? (chars().filter((c) => progressStore.isMastered(c.character)).length / chars().length) * 100 : 0}%`,
            }}
          />
        </div>
        <div
          class="grid gap-2.5 mt-4"
          style={{ 'grid-template-columns': `repeat(${levels.length}, minmax(0, 1fr))` }}
          role="group"
          aria-label="Niveles HSK"
        >
          <For each={levels}>
            {(lvl) => {
              const count = characterStore.getCharacterCountByLevel(lvl);
              const selected = () => characterStore.state.selectedLevels.includes(lvl);
              return (
                <button
                  role="checkbox"
                  aria-checked={selected()}
                  aria-label={`HSK ${lvl}, ${
                    masteredIn(lvl) > 0 ? `${masteredIn(lvl)} de ${count}` : count
                  } caracteres`}
                  onClick={() => pickLevel(lvl)}
                  class="relative rounded-tile border-2 px-3 pt-3 pb-2.5 text-left transition-colors duration-200 ease-out active:scale-[0.97]"
                  classList={{
                    'bg-surface text-ink border-ink': selected(),
                    'bg-surface text-ink border-line': !selected(),
                  }}
                >
                  <Show when={selected()}>
                    <Icon name="check" size={14} class="absolute right-2 top-2 text-ink" />
                  </Show>
                  <div class="flex items-baseline gap-1">
                    <span class="text-[0.6875rem] font-semibold tracking-wider text-ink-faint">
                      HSK
                    </span>
                    <span class="font-display text-2xl font-semibold leading-none">{lvl}</span>
                  </div>
                  <div class="text-[0.6875rem] mt-1.5 tabular-nums leading-tight text-ink-soft">
                    {masteredIn(lvl) > 0 ? `${masteredIn(lvl)} de ${count}` : count}
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={pending() === 0 && !chars().some((c) => progressStore.isNew(c.character))}>
          <p class="mt-4 text-sm text-ink-soft">
            Has visto todo este nivel.
            {levels.some((l) => !characterStore.state.selectedLevels.includes(l))
              ? ' Marca otro nivel.'
              : ''}
          </p>
        </Show>
      </section>

      {/* Character of the day */}
      <button
        onClick={() => props.onNavigate({ page: 'trazos', char: daily().character })}
        class="tile mt-4 p-3 flex items-center gap-3 text-left animate-rise [animation-delay:240ms] active:scale-[0.99] transition-transform"
        aria-label={`Carácter del día: ${daily().character}. Ver sus trazos`}
      >
        <div class="relative h-[4.5rem] w-[4.5rem] flex-shrink-0">
          <RiceGrid class="absolute inset-0 h-full w-full" />
          <div
            class="absolute inset-0 flex items-center justify-center font-hanzi text-[2.75rem] leading-none"
            lang="zh-CN"
          >
            {daily().character}
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm text-ink-soft">Carácter del día</div>
          <div class="font-display text-[1.15rem] font-semibold leading-snug first-letter:uppercase">
            {spokenMeaning(daily())}
          </div>
          <Pinyin text={daily().pinyin} class="text-sm font-medium" />
        </div>
        <Icon name="next" size={18} class="text-ink-faint flex-shrink-0" />
      </button>

      <nav class="mt-4 border-t border-line/80 animate-rise [animation-delay:90ms]">
        <For each={modes}>
          {(mode) => (
            <button
              onClick={mode.go}
              class="flex items-center h-11 w-full text-left text-[0.9375rem] text-ink border-b border-line/80"
            >
              <span class="flex-1">
                {mode.glyph === '练' && characterStore.state.selectedLevels.length === 1
                  ? 'Todo el nivel'
                  : mode.title}
              </span>
              <span class="mr-2 max-w-[11rem] truncate text-sm text-ink-soft">{mode.body}</span>
              <Icon name="next" size={16} class="text-ink-faint" />
            </button>
          )}
        </For>
      </nav>

      <button
        onClick={() => props.onNavigate({ page: 'acerca' })}
        class="mt-1 mx-auto flex h-11 items-center justify-center px-4 text-sm text-ink-soft"
      >
        Acerca de
      </button>

      <div class="mt-auto pt-4">
        <Show
          when={pending() > 0}
          fallback={
            <Show when={chars().some((c) => progressStore.isNew(c.character))}>
              <button
                onClick={() => props.onNavigate({ page: 'entrenamiento', pool: 'more' })}
                class="btn-ink h-14 w-full text-base"
              >
                Aprender 5 más
                <Icon name="next" size={18} />
              </button>
            </Show>
          }
        >
          <button
            onClick={() => props.onNavigate({ page: 'entrenamiento', pool: 'today' })}
            class="btn-ink h-14 w-full text-base"
          >
            {todayAction()}
            <Icon name="next" size={18} />
          </button>
        </Show>
      </div>
    </div>
    </div>
  );
};

export default Home;
