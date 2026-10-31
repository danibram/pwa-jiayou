import { Component, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import Icon from '../components/Icon';
import Pinyin from '../components/Pinyin';
import ScoreModal, { SessionSummary } from '../components/ScoreModal';
import StrokeCanvas, { StrokeCanvasApi } from '../components/StrokeCanvas';
import SwipeableCard from '../components/SwipeableCard';
import TopBar from '../components/TopBar';
import { spokenMeaning } from '../utils/meaning';
import { characterStore } from '../stores/characterStore';
import { Grade, progressStore } from '../stores/progressStore';
import { HSKCharacter } from '../types';
import { takeHint } from '../utils/hints';
import { shuffle } from '../utils/shuffle';
import { canSpeak, currentVoiceLabel, speak } from '../utils/speech';

/** today: due cards plus new ones; more: five extra new ones; all: free practice over the marked levels. */
export type ReviewPool = 'today' | 'more' | 'all';

interface EntrenamientoProps {
  pool: ReviewPool;
  onGoHome: () => void;
  backLabel?: string;
  onOpenStrokes: (char: string) => void;
}

/**
 * learn: kept so an old deck can still name a first look. New sessions use quiz.
 * quiz: recognise the character. write: produce it from pinyin and meaning.
 * retry: a card missed earlier in the session, shown again at the end.
 */
type CardKind = 'learn' | 'quiz' | 'write' | 'retry';
/** A new character is shown, then covered, then checked. It is not graded today. */
type NewStep = 'learn' | 'seen' | 'ask' | 'check';

interface DeckCard {
  char: HSKCharacter;
  kind: CardKind;
}

const GRADES: { grade: Grade; label: string; key: string; class: string }[] = [
  { grade: 'again', label: 'No me acuerdo', key: '1', class: 'btn-ink' },
  { grade: 'hard', label: 'Casi', key: '2', class: 'btn-quiet' },
  { grade: 'good', label: 'Bien', key: '3', class: 'btn-jade' },
];

const GRADE_LABEL: Record<Grade, string> = {
  again: 'No me acuerdo',
  hard: 'Casi',
  good: 'Bien',
};

const writeGrade = (mistakes: number, usedHint: boolean): Grade =>
  usedHint || mistakes >= 3 ? 'again' : mistakes > 0 ? 'hard' : 'good';

/** Due cards first. A new character is shown, then asked tomorrow. */
const planToday = (due: HSKCharacter[], fresh: HSKCharacter[]): DeckCard[] => {
  let writeTurn = false;
  const items: DeckCard[] = shuffle(due).map((char) => {
    // Alternate recall and production for characters the learner already recognises.
    const write = progressStore.canWrite(char.character) && (writeTurn = !writeTurn);
    return { char, kind: write ? 'write' : 'quiz' };
  });
  let cursor = Math.min(items.length, 2);
  for (const char of fresh) {
    items.splice(cursor, 0, { char, kind: 'quiz' });
    cursor += 2;
  }
  return items;
};

const Entrenamiento: Component<EntrenamientoProps> = (props) => {
  const [deck, setDeck] = createSignal<DeckCard[]>([]);
  const [position, setPosition] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [step, setStep] = createSignal<NewStep>('learn');
  const [feedback, setFeedback] = createSignal<Grade | null>(null);
  const [summary, setSummary] = createSignal<SessionSummary | null>(null);
  const [counts, setCounts] = createSignal({ again: 0, hard: 0, good: 0 });
  const [missed, setMissed] = createSignal<HSKCharacter[]>([]);
  const [seen, setSeen] = createSignal<HSKCharacter[]>([]);
  const [taught, setTaught] = createSignal<HSKCharacter[]>([]);
  const [writeState, setWriteState] = createSignal({ done: 0, total: 0, mistakes: 0, hint: false });
  const [heading, setHeading] = createSignal('Repaso de hoy');
  const showHint = takeHint('review');
  let writeApi: StrokeCanvasApi | undefined;

  const freePractice = () => props.pool === 'all';

  const buildDeck = (): DeckCard[] => {
    const chars = characterStore.getCharactersByLevel();
    if (props.pool === 'all') return shuffle(chars).map((char) => ({ char, kind: 'quiz' }));
    const { due, fresh } = progressStore.buildQueue(chars, props.pool === 'more' ? 5 : 0);
    return planToday(props.pool === 'more' ? [] : due, fresh);
  };

  const current = () => deck()[position()];

  const enterCard = () => {
    setRevealed(false);
    setStep('learn');
    setWriteState({ done: 0, total: 0, mistakes: 0, hint: false });
  };

  const openingTitle = (cards: DeckCard[]) => {
    if (props.pool === 'all') {
      return characterStore.state.selectedLevels.length === 1 ? 'Todo el nivel' : 'Todo lo marcado';
    }
    if (props.pool === 'more') return 'Aprender';
    const anyDue = cards.some((c) => !progressStore.isNew(c.char.character));
    return anyDue ? 'Repaso de hoy' : 'Aprender';
  };

  const start = (cards: DeckCard[]) => {
    characterStore.startTraining();
    setHeading(openingTitle(cards));
    setDeck(cards);
    setPosition(0);
    setFeedback(null);
    setCounts({ again: 0, hard: 0, good: 0 });
    setMissed([]);
    setSeen([]);
    setTaught([]);
    setSummary(null);
    enterCard();
  };

  onMount(() => start(buildDeck()));

  const finish = () => {
    const c = counts();
    const total = c.again + c.hard + c.good;
    setSummary({
      ...c,
      total,
      percentage: total ? Math.round(((c.good + c.hard) / total) * 100) : 0,
      streak: progressStore.daily.streak,
    });
  };

  const next = () => {
    setFeedback(null);
    if (position() < deck().length - 1) {
      setPosition((p) => p + 1);
      enterCard();
    } else finish();
  };

  const reveal = () => {
    const card = current();
    if (!card || revealed() || feedback() || summary() || card.kind === 'write') return;
    setRevealed(true);
  };

  const record = (card: DeckCard, g: Grade) => {
    const char = card.char;
    if (freePractice()) progressStore.practice(char.character, g !== 'again');
    else progressStore.grade(char.character, g);

    if (card.kind !== 'retry') {
      characterStore.recordAnswer(g !== 'again');
      setCounts((c) => ({ ...c, [g]: c[g] + 1 }));
      if (!seen().includes(char)) setSeen((s) => [...s, char]);
    }
    if (g === 'again') {
      if (!missed().includes(char)) setMissed((m) => [...m, char]);
      // Relearn in the same session, once.
      if (card.kind !== 'retry') setDeck((d) => [...d, { char, kind: 'retry' }]);
    }
  };

  /** First meeting. Tomorrow it is a covered question. Today it is not a grade. */
  const meet = () => {
    const card = current();
    if (!card || !revealed() || feedback() || summary() || !progressStore.isNew(card.char.character))
      return;
    if (!freePractice()) progressStore.introduce(card.char.character);
    if (!taught().includes(card.char)) setTaught((t) => [...t, card.char]);
    next();
  };

  /** Seen, but not learned yet. It comes back once in this session, and it is not introduced. */
  const againToday = () => {
    const card = current();
    if (!card || feedback() || summary() || !progressStore.isNew(card.char.character)) return;
    const later = deck().slice(position() + 1).some((c) => c.char.character === card.char.character);
    if (!later) setDeck((d) => [...d, { char: card.char, kind: 'quiz' }]);
    next();
  };

  const grade = (g: Grade) => {
    const card = current();
    if (
      !card ||
      !revealed() ||
      feedback() ||
      summary() ||
      card.kind === 'write' ||
      progressStore.isNew(card.char.character)
    )
      return;
    record(card, g);
    setFeedback(g);
    setTimeout(next, 380);
  };

  const handleWritten = (mistakes: number) => {
    const card = current();
    if (!card || card.kind !== 'write') return;
    const g = writeGrade(mistakes, writeState().hint);
    record(card, g);
    setWriteState((s) => ({ ...s, mistakes }));
    setFeedback(g);
    speak(card.char.pinyin, card.char.character, false);
    setTimeout(next, 1300);
  };

  const giveUp = () => {
    const card = current();
    if (!card || card.kind !== 'write' || feedback()) return;
    record(card, 'again');
    setFeedback('again');
    speak(card.char.pinyin, card.char.character, false);
    // Let the learner watch the full character before moving on.
    writeApi?.showAnswer(() => setTimeout(next, 700));
  };

  const onKey = (e: KeyboardEvent) => {
    const card = current();
    if (summary() || !card || card.kind === 'write') return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
        if (progressStore.isNew(card.char.character)) {
        if (step() === 'learn') {
          setStep('ask');
          setRevealed(false);
        } else if (step() === 'ask') {
          setStep('check');
          setRevealed(true);
        }
        return;
      }
      if (!revealed()) reveal();
      else grade('good');
      return;
    }
    if (!revealed()) return;
    const byKey = GRADES.find((g) => g.key === e.key);
    if (byKey) grade(byKey.grade);
    else if (e.key === 'ArrowRight') grade('good');
    else if (e.key === 'ArrowLeft') grade('again');
  };

  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const [leaving, setLeaving] = createSignal(false);

  const leave = () => {
    characterStore.resetTraining();
    props.onGoHome();
  };

  const handleGoHome = () => {
    const started = position() > 0 || step() !== 'learn' || revealed();
    if (!isEmpty() && started && !leaving()) {
      setLeaving(true);
      return;
    }
    leave();
  };

  // Count characters, not cards: a missed one comes back at the end, but it is one character.
  const charTotal = () => new Set(deck().map((c) => c.char.character)).size;
  const charIndex = () =>
    new Set(
      deck()
        .slice(0, position() + 1)
        .map((c) => c.char.character)
    ).size;
  const isEmpty = () => deck().length === 0;
  const cardLabel = (card: DeckCard) => {
    if (revealed()) return 'Respuesta';
    return ({
      learn: 'Nuevo',
      quiz: progressStore.isNew(card.char.character) ? 'Nuevo' : 'Repaso',
      retry: 'La fallaste',
      write: '',
    })[card.kind];
  };

  return (
    <div class="screen">
      <TopBar
        title={isEmpty() ? heading() : `${charIndex()} de ${charTotal()}`}
        onBack={handleGoHome}
        backLabel={props.backLabel ?? 'Volver'}
      />

      <Show
        when={!isEmpty()}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
            <div class="font-hanzi text-6xl text-ink">好</div>
            <h2 class="font-display text-2xl font-semibold">Todo al día</h2>
            <p class="text-ink-soft">
              No te queda nada por repasar hoy en {characterStore.levelLabel()}.
            </p>
            <button class="btn-ink h-12 px-5 mt-3" onClick={handleGoHome}>
              Volver al inicio
            </button>
          </div>
        }
      >
        <Show when={current()} keyed>
          {(card) => (
            <Switch>
              {/* Production: write it from pinyin and meaning */}
              <Match when={card.kind === 'write'}>
                <div class="flex-1 flex flex-col justify-center min-h-0 py-4 gap-4 animate-pop">
                  <div class="text-center">
                    <div class="eyebrow">Escríbelo de memoria</div>
                    <div class="flex items-center justify-center gap-1 mt-1">
                      <Pinyin text={card.char.pinyin} class="text-[1.75rem] font-medium" />
                      <Show when={canSpeak()}>
                        <button
                          onClick={() => speak(card.char.pinyin, card.char.character)}
                          class="btn-quiet h-9 px-2.5 text-xs"
                          aria-label={`Escuchar, voz ${currentVoiceLabel()}`}
                        >
                          <Icon name="sound" size={16} />
                          {currentVoiceLabel()}
                        </button>
                      </Show>
                    </div>
                    <p class="text-ink-soft first-letter:uppercase">{spokenMeaning(card.char)}</p>
                  </div>
                  <div class="relative w-full mx-auto max-w-[min(100%,46dvh)]">
                    <StrokeCanvas
                      char={card.char.character}
                      mode="write"
                      step={null}
                      showOutline={false}
                      startHint="never"
                      onHint={() => setWriteState((s) => ({ ...s, hint: true }))}
                      onReady={(n) => setWriteState((s) => ({ ...s, total: n }))}
                      onStroke={(d, m) => setWriteState((s) => ({ ...s, done: d, mistakes: m }))}
                      onMistake={(_, m) => setWriteState((s) => ({ ...s, mistakes: m }))}
                      onComplete={handleWritten}
                      api={(api) => (writeApi = api)}
                    />
                    <Show when={feedback()}>
                      {(g) => (
                        <div
                          class="absolute left-1/2 -translate-x-1/2 bottom-4 px-4 h-9 rounded-full flex items-center gap-1.5 text-sm font-semibold text-white shadow-lift animate-pop whitespace-nowrap"
                          classList={{
                            'bg-jade': g() === 'good',
                            'bg-ink-soft': g() === 'hard',
                            'bg-seal': g() === 'again',
                          }}
                        >
                          <Icon name={g() === 'again' ? 'replay' : 'check'} size={16} />
                          {GRADE_LABEL[g()]}
                        </div>
                      )}
                    </Show>
                  </div>
                  <Show when={!leaving()}>
                  <div class="flex items-center gap-3 w-full mx-auto max-w-[min(100%,46dvh)]">
                    <button
                      onClick={() => writeApi?.hint()}
                      class="btn-quiet h-12 px-4 text-sm"
                      disabled={!!feedback()}
                    >
                      <Icon name="brush" size={18} />
                      Pista
                    </button>
                    <button
                      onClick={giveUp}
                      class="btn-ghost h-12 px-3 text-sm"
                      disabled={!!feedback()}
                    >
                      No me acuerdo
                    </button>
                    <div class="flex-1 text-right text-sm text-ink-soft tabular-nums">
                      {writeState().done} / {writeState().total || card.char.stroke_count}{' '}
                      {(writeState().total || card.char.stroke_count) === 1 ? 'trazo' : 'trazos'}
                      <Show when={writeState().mistakes > 0}>
                        <span class="text-ink-soft">
                          {' '}
                          · {writeState().mistakes}{' '}
                          {writeState().mistakes === 1 ? 'error' : 'errores'}
                        </span>
                      </Show>
                    </div>
                  </div>
                  <p class="text-center text-[0.8125rem] text-ink-soft h-5">
                    {showHint ? 'Sin errores es Bien; con pista cuenta como No me acuerdo' : ''}
                  </p>
                  </Show>
                </div>
              </Match>

              {/* Recognition and new-character cards */}
              <Match when={card.kind !== 'write'}>
                <div class="flex-1 flex flex-col min-h-0 pt-2">
                  <div class="relative flex-1 min-h-0 flex flex-col animate-pop">
                    <Show when={progressStore.isNew(card.char.character)}>
                      <div
                        class="pointer-events-none absolute left-1/2 top-7 z-10 flex -translate-x-1/2 items-center gap-1.5"
                        aria-label={`Paso ${{ learn: 1, seen: 1, ask: 2, check: 3 }[step()]} de 3`}
                      >
                        <For each={[1, 2, 3]}>
                          {(n) => {
                            const here = () => n === ({ learn: 1, seen: 1, ask: 2, check: 3 } as const)[step()];
                            return (
                              <span
                                class="h-2 rounded-full"
                                classList={{ 'w-5 bg-ink': here(), 'w-2 bg-ink/50': !here() }}
                              />
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                    <SwipeableCard
                      character={card.char}
                      fill
                      flipped={revealed() || progressStore.isNew(card.char.character)}
                      concealCharacter={
                        progressStore.isNew(card.char.character) && step() === 'ask'
                      }
                      hear={false}
                      recall={step() === 'ask'}
                      still={progressStore.isNew(card.char.character)}
                      onFlip={reveal}
                      onSwipeLeft={() => grade('again')}
                      onSwipeRight={() => grade('good')}
                      swipeEnabled={revealed() && !progressStore.isNew(card.char.character)}
                      label={progressStore.isNew(card.char.character) ? '' : cardLabel(card)}
                      prompt="¿Qué significa y cómo se lee?"
                      stamps={{
                        right: { text: 'Bien', tone: 'jade' },
                        left: { text: 'No me acuerdo', tone: 'seal' },
                      }}
                    />
                    <Show when={feedback()}>
                      <div
                        class="absolute inset-0 rounded-card pointer-events-none animate-fade ring-[3px]"
                        classList={{
                          'ring-jade bg-jade/[0.06]': feedback() === 'good',
                          'ring-ink/30 bg-ink/[0.03]': feedback() === 'hard',
                          'ring-seal bg-seal/[0.06]': feedback() === 'again',
                        }}
                      />
                    </Show>
                  </div>
                </div>

                <div class="flex-shrink-0 pt-6">
                  <Show when={progressStore.isNew(card.char.character)}>
                    <div class="mb-6 flex h-11 items-center justify-center" classList={{ invisible: leaving() }}>
                      <Show when={canSpeak()}>
                        <button
                          type="button"
                          class="btn-quiet h-11 px-4 text-sm"
                          onClick={() => speak(card.char.pinyin, card.char.character)}
                          aria-label={`Escuchar, voz ${currentVoiceLabel()}`}
                        >
                          <Icon name="sound" size={16} />
                          {currentVoiceLabel()}
                        </button>
                      </Show>
                    </div>
                    <p
                      class="mb-6 flex h-6 items-center justify-center text-center text-[0.9375rem] font-medium text-ink"
                      classList={{ invisible: leaving() || step() !== 'check' }}
                      aria-hidden={leaving() || step() !== 'check' ? 'true' : undefined}
                    >
                      ¿Lo tenías?
                    </p>
                  </Show>
                  <div classList={{ 'pointer-events-none invisible': leaving() }}>
                  <Switch>
                    <Match when={progressStore.isNew(card.char.character) && step() === 'learn'}>
                      <button
                        onClick={() => {
                          setStep('ask');
                          setRevealed(false);
                        }}
                        class="btn-ink h-14 w-full text-[0.9375rem]"
                      >
                        Ahora, de memoria
                      </button>
                    </Match>
                    <Match when={progressStore.isNew(card.char.character) && step() === 'ask'}>
                      <button
                        onClick={() => {
                          setStep('check');
                          setRevealed(true);
                        }}
                        class="btn-ink h-14 w-full text-[0.9375rem]"
                      >
                        Comprobar
                      </button>
                    </Match>
                    <Match when={progressStore.isNew(card.char.character) && step() === 'check'}>
                      <div class="grid grid-cols-2 gap-2">
                        <button onClick={againToday} class="btn-quiet h-14 text-[0.9375rem]">
                          Otra vez hoy
                        </button>
                        <button onClick={meet} class="btn-ink h-14 text-[0.9375rem]">
                          Lo sabía
                        </button>
                      </div>
                    </Match>
                    <Match when={!revealed()}>
                      <button onClick={reveal} class="btn-ink h-14 w-full text-[0.9375rem]">
                        Mostrar respuesta
                      </button>
                    </Match>
                    <Match when={revealed()}>
                      <div class="grid grid-cols-3 gap-2 animate-fade">
                        <For each={GRADES}>
                          {(g) => (
                            <button
                              onClick={() => grade(g.grade)}
                              disabled={feedback() !== null}
                              class={`h-14 px-2 text-sm text-center leading-tight ${g.class}`}
                            >
                              <Show when={g.grade === 'again'}>
                                <span class="h-2 w-2 rounded-full bg-seal flex-shrink-0" />
                              </Show>
                              <Show when={g.grade === 'good'}>
                                <Icon name="check" size={16} />
                              </Show>
                              {g.label}
                            </button>
                          )}
                        </For>
                      </div>
                    </Match>
                  </Switch>
                  </div>
                  <Show when={leaving()}>
                    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/55">
                      <div
                        class="sheet w-full max-w-[40rem] border-x-0 px-4 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="leave-title"
                      >
                        <p id="leave-title" class="text-center font-display text-xl font-semibold text-ink">
                          {heading() === 'Aprender' ? '¿Sales de la sesión?' : '¿Sales del repaso?'}
                        </p>
                        <p class="mt-1 text-center text-sm text-ink-soft">
                          {position() > 0
                            ? 'Lo que ya marcaste queda guardado.'
                            : 'Aún no has marcado nada.'}
                        </p>
                        <button
                          type="button"
                          class="btn-ink mt-4 h-14 w-full text-[0.9375rem]"
                          onClick={() => setLeaving(false)}
                        >
                          Seguir
                        </button>
                        <button
                          type="button"
                          class="mt-1 h-11 w-full text-sm text-ink-soft"
                          onClick={leave}
                        >
                          Salir
                        </button>
                      </div>
                    </div>
                  </Show>
                  <p class="mt-2 h-5 text-center text-[0.8125rem] text-ink-soft">
                    {leaving()
                      ? ''
                      : progressStore.isNew(card.char.character)
                        ? ''
                        : !showHint
                          ? ''
                          : revealed()
                            ? 'Desliza: derecha si acertaste, izquierda si no'
                            : 'Piénsalo y toca la tarjeta para comprobar'}
                  </p>
                </div>
              </Match>
            </Switch>
          )}
        </Show>
      </Show>

      <ScoreModal
        summary={summary()}
        missed={missed()}
        practised={seen().length > 0 ? seen() : taught()}
        onReviewMissed={() =>
          start(shuffle(missed()).map((char) => ({ char, kind: 'quiz' as const })))
        }
        onOpenStrokes={props.onOpenStrokes}
        onGoHome={handleGoHome}
      />
    </div>
  );
};

export default Entrenamiento;
