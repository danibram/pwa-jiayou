import { Component, createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import Icon from '../components/Icon';
import SwipeableCard from '../components/SwipeableCard';
import TopBar from '../components/TopBar';
import { characterStore } from '../stores/characterStore';
import { progressStore } from '../stores/progressStore';
import { openInPleco } from '../utils/plecoIntegration';
import { canSpeak, currentVoiceLabel, speak } from '../utils/speech';
import { shouldHandleShortcut } from '../utils/keyboard';

const HINT_KEY = 'hsk-gesture-hint-views';
const HINT_LIMIT = 4;

const readHintViews = () => {
  try {
    return Number(localStorage.getItem(HINT_KEY) ?? 0);
  } catch {
    return HINT_LIMIT;
  }
};

const writeHintViews = (n: number) => {
  try {
    localStorage.setItem(HINT_KEY, String(Math.min(n, HINT_LIMIT)));
  } catch {
    // ignore
  }
};

interface TarjetasProps {
  onGoHome: () => void;
  onOpenStrokes: (char: string) => void;
}

const Tarjetas: Component<TarjetasProps> = (props) => {
  const characters = () => characterStore.getCharactersByLevel();
  const currentChar = () => characters()[characterStore.state.currentIndex];
  const currentIndex = () => characterStore.state.currentIndex;
  const total = () => characters().length;
  const [flipped, setFlipped] = createSignal(false);
  const [hintViews, setHintViews] = createSignal(readHintViews());

  createEffect(
    on(currentIndex, () => {
      setFlipped(false);
      setHintViews((v) => {
        const next = v + 1;
        writeHintViews(next);
        return next;
      });
    })
  );

  const next = () => {
    if (currentIndex() >= total() - 1) return;
    characterStore.nextCharacter();
  };
  const previous = () => {
    if (currentIndex() <= 0) return;
    characterStore.previousCharacter();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!shouldHandleShortcut(e)) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') previous();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlipped((f) => !f);
    }
  };

  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const mixed = () => {
    const list = characters();
    return (
      list.some((c) => progressStore.isNew(c.character)) &&
      list.some((c) => !progressStore.isNew(c.character))
    );
  };

  return (
    <div class="screen screen-card">
      <TopBar
        title="Explorar"
        subtitle={`${characterStore.levelLabel()} · ${currentIndex() + 1} de ${total()}`}
        onBack={props.onGoHome}
        backLabel="Volver"
      />

      <div class="flex-1 flex flex-col w-full min-h-0 pt-2">
        <Show
          when={currentChar()}
          fallback={
            <div class="text-center text-ink-soft">
              <p class="text-lg mb-4">No hay caracteres en este nivel</p>
              <button onClick={props.onGoHome} class="btn-quiet h-11 px-5">
                Volver al inicio
              </button>
            </div>
          }
        >
          <div class="relative min-h-0 flex-1 pb-14">
          <SwipeableCard
            character={currentChar()}
            flipped={flipped()}
            onFlip={() => setFlipped((f) => !f)}
            onSwipeLeft={next}
            onSwipeRight={previous}
            label={
              flipped() || !mixed()
                ? ''
                : progressStore.isMastered(currentChar().character)
                  ? 'Dominado'
                  : progressStore.isNew(currentChar().character)
                    ? 'Nuevo'
                    : 'En curso'
            }
            prompt={flipped() ? '' : '¿Qué significa?'}
            fill
          />
          <Show when={currentChar()}>
            <button
              type="button"
              class="absolute bottom-3 left-1/2 z-10 h-11 -translate-x-1/2 whitespace-nowrap px-3 text-sm text-ink-soft underline decoration-line underline-offset-4"
              onClick={() => openInPleco(currentChar()!.character)}
            >
              Diccionario Pleco
            </button>
          </Show>
          </div>
        </Show>
      </div>

      <div class="mt-4 flex-shrink-0">
          <div class="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <div class="flex justify-start">
            <button
              onClick={previous}
              disabled={currentIndex() === 0}
              class="btn-quiet h-11 w-11"
              aria-label="Anterior"
            >
              <Icon name="prev" size={22} />
            </button>
          </div>
          <div class="flex items-center justify-center">
            <Show when={canSpeak()}>
              <button
                onClick={() => currentChar() && speak(currentChar().pinyin, currentChar().character)}
                class="btn-quiet h-11 px-4 text-sm max-[379px]:px-2 max-[379px]:text-xs"
                aria-label={`Escuchar, voz ${currentVoiceLabel()}`}
              >
                <Icon name="sound" size={18} />
                <span class="whitespace-nowrap">Escuchar · {currentVoiceLabel()}</span>
              </button>
            </Show>
          </div>
          <button
            onClick={() => currentChar() && props.onOpenStrokes(currentChar().character)}
            class="btn-quiet h-11 w-11 justify-self-end"
            aria-label="Escribir"
          >
            <Icon name="brush" size={18} />
          </button>
        </div>
        <button
          onClick={next}
          disabled={currentIndex() >= total() - 1}
          class="btn-ink mt-6 h-14 w-full text-[0.9375rem]"
          aria-label="Siguiente"
        >
          Siguiente
          <Icon name="next" size={18} />
        </button>
        <p class="mt-2 text-center text-[0.8125rem] text-ink-soft h-5">
          {hintViews() >= HINT_LIMIT
            ? ''
            : flipped()
              ? 'Toca otra vez para tapar'
              : 'Desliza para cambiar · toca para ver el significado'}
        </p>
      </div>
    </div>
  );
};

export default Tarjetas;
