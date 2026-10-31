import { Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import Icon from '../components/Icon';
import SwipeableCard, { SwipeableCardApi } from '../components/SwipeableCard';
import TopBar from '../components/TopBar';
import { charactersInTopic, topicById } from '../data/topics';
import { characterStore } from '../stores/characterStore';
import { canSpeak, currentVoiceLabel, speak } from '../utils/speech';

interface TemaProps {
  topicId: string;
  initialIndex?: number;
  onBack: () => void;
  onOpenStrokes: (char: string, index: number) => void;
}

const Tema: Component<TemaProps> = (props) => {
  const topic = () => topicById(props.topicId);
  const characters = () => charactersInTopic(props.topicId, characterStore.state.characters);
  const total = () => characters().length;
  const clamp = (index: number) => Math.min(Math.max(0, index), Math.max(0, total() - 1));

  const [index, setIndex] = createSignal(clamp(props.initialIndex ?? 0));
  const [flipped, setFlipped] = createSignal(false);
  const current = () => characters()[index()];
  let card: SwipeableCardApi | undefined;

  const commit = (delta: number) => {
    const next = index() + delta;
    if (next < 0 || next >= total()) return;
    setFlipped(false);
    setIndex(next);
  };

  const go = (delta: number) => {
    if (index() + delta < 0 || index() + delta >= total()) return;
    const direction = delta > 0 ? 'left' : 'right';
    if (card) card.swipe(direction);
    else commit(delta);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlipped((value) => !value);
    }
  };

  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  return (
    <div class="screen">
      <TopBar
        title={topic()?.title ?? 'Tema'}
        subtitle={total() > 0 ? `${index() + 1} de ${total()}` : undefined}
        onBack={props.onBack}
        backLabel="Temas"
      />

      <Show
        when={current()}
        fallback={
          <p class="m-auto text-ink-soft">Este tema no tiene caracteres.</p>
        }
      >
        {(char) => (
          <>
            <div class="flex min-h-0 w-full flex-1 flex-col pt-2">
              <div class="relative min-h-0 flex-1">
                <SwipeableCard
                  character={char()}
                  flipped={flipped()}
                  onFlip={() => setFlipped((value) => !value)}
                  onSwipeLeft={() => commit(1)}
                  onSwipeRight={() => commit(-1)}
                  api={(api) => (card = api)}
                  label={flipped() ? '' : `HSK ${char().hsk_level}`}
                  prompt={flipped() ? '' : '¿Qué significa?'}
                  fill
                />
              </div>
            </div>

            <div class="mt-4 flex-shrink-0">
              <div class="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
                <div class="flex justify-start">
                  <button
                    onClick={() => go(-1)}
                    disabled={index() === 0}
                    class="btn-quiet h-11 w-11"
                    aria-label="Anterior"
                  >
                    <Icon name="prev" size={22} />
                  </button>
                </div>
                <div class="flex items-center justify-center">
                  <Show when={canSpeak()}>
                    <button
                      onClick={() => speak(char().pinyin, char().character)}
                      class="btn-quiet h-11 px-4 text-sm"
                      aria-label={`Escuchar, voz ${currentVoiceLabel()}`}
                    >
                      <Icon name="sound" size={18} />
                      <span class="whitespace-nowrap">Escuchar · {currentVoiceLabel()}</span>
                    </button>
                  </Show>
                </div>
                <button
                  onClick={() => props.onOpenStrokes(char().character, index())}
                  class="btn-quiet h-11 w-11 justify-self-end"
                  aria-label="Escribir"
                >
                  <Icon name="brush" size={18} />
                </button>
              </div>
              <button
                onClick={() => go(1)}
                disabled={index() >= total() - 1}
                class="btn-ink mt-6 h-14 w-full text-[0.9375rem]"
                aria-label="Siguiente"
              >
                Siguiente
                <Icon name="next" size={18} />
              </button>
              <p class="mt-2 h-5 text-center text-[0.8125rem] text-ink-soft">
                {flipped()
                  ? 'Toca otra vez para tapar'
                  : 'Desliza para cambiar · toca para ver el significado'}
              </p>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default Tema;
