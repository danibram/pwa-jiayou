import { glossHead } from '../utils/glossDisplay';
import { Component, createMemo, createSignal, For, Show, untrack } from 'solid-js';
import Icon from '../components/Icon';
import RiceGrid from '../components/RiceGrid';
import ThemeToggle from '../components/ThemeToggle';
import HomeProgress, { type ProgressSnapshot } from '../components/HomeProgress';
import LevelChips from '../components/LevelChips';
import { summarizeProgress, type ProgressSummary } from '../utils/progressSummary';
import { agree, countNoun, type NounKind } from '../utils/countNoun';
import { canLearnNew, DAILY_NEW_RULE_TEXT, progressStore, WORD_NEW_PER_DAY } from '../stores/progressStore';
import ActivityCalendar from '../components/ActivityCalendar';
import Pinyin from '../components/Pinyin';
import { createDialogFocus } from '../utils/dialog';
import type { HomeTarget } from '../screen';
import { vocabularyByLevel } from '../data/vocabulary';
import { allWords } from '../stores/myWordsStore';
import { vocabularyProgressStore } from '../stores/vocabularyProgressStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { prepareListMedia } from '../utils/levelPacks';
import { hskListId } from '../data/lists';
import type { HskLevel } from '../types';
import { discardVocabularySession, hasStoredVocabularySession, loadVocabularySession } from '../utils/vocabularySession';
import { homeLastKey, PRACTICE_SESSION_PREFIX } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

interface HomeProps {
  onNavigate: (target: HomeTarget) => void;
}

type Step = { kind: 'more'; n: number } | { kind: 'weak'; n: number } | { kind: 'write' } | { kind: 'all' } | { kind: 'done' };

/**
 * Under a closed day. The headline already says "Hecho por hoy", so there is no second button
 * saying it again: any extra study is a quiet link, and nothing is pinned over the page.
 */
const NextAction: Component<{
  next: Step;
  onMore: () => void;
  onWrite?: () => void;
  onAll: () => void;
}> = (props) => {
  const extra = () => {
    const next = props.next;
    // Flojos already has its own link in the progress card.
    if (next.kind === 'more') return { label: `aprender ${next.n} más`, go: props.onMore };
    if (next.kind === 'write' && props.onWrite) return { label: 'practicar escritura', go: props.onWrite };
    if (next.kind === 'all') return { label: 'repasar todo', go: props.onAll };
    return null;
  };
  return (
    <Show when={extra()}>
      {(item) => (
        <button
          type="button"
          class="mx-auto flex h-11 items-center px-4 text-sm text-ink-soft underline decoration-ink/30 underline-offset-4"
          onClick={() => item().go()}
        >
          Si te apetece, {item().label}
        </button>
      )}
    </Show>
  );
};

/** Says the daily limit out loud once it is reached, so "Hecho por hoy" is not a mystery. */
const CapNote: Component<{ limit: number; kind: NounKind }> = (props) => {
  // Plural articles match the object pronouns; the singular article is el / la.
  const article = () => (props.limit === 1 ? (props.kind === 'word' ? 'la' : 'el') : props.kind === 'word' ? 'las' : 'los');
  const [open, setOpen] = createSignal(false);
  return (
    <div class="mt-3 rounded-tile bg-line/30 px-3 py-2.5 text-sm text-ink-soft">
      <p>
        Has aprendido {article()} {props.limit === 1 ? countNoun(1, props.kind).slice(2) : countNoun(props.limit, props.kind)} {agree(props.limit, props.kind, 'nuev')} de hoy. Mañana más.{' '}
        <button type="button" class="font-medium text-ink underline decoration-ink/30 underline-offset-4" aria-expanded={open()} onClick={() => setOpen((v) => !v)}>
          ¿Por qué?
        </button>
      </p>
      <Show when={open()}>
        <p class="mt-1.5 text-xs leading-relaxed">
          Lo nuevo se fija repasándolo en los días siguientes. Con {DAILY_NEW_RULE_TEXT}, los repasos de mañana siguen siendo pocos y se te queda más.
        </p>
      </Show>
    </div>
  );
};

type HomeMode = 'vocabulary' | 'characters';

/** What Home showed last time, per mode and level set. Read once per visit, then replaced, so each gain is named once. */
const readLast = (mode: HomeMode, scope: string): ProgressSnapshot | null => {
  try {
    const value: unknown = JSON.parse(storage.read(homeLastKey(mode)) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const { mastered, learning, scope: saved } = value as Record<string, unknown>;
    // Different levels mean different totals; comparing them would invent gains.
    if (saved !== scope || !Number.isInteger(mastered) || !Number.isInteger(learning)) return null;
    return { mastered: mastered as number, learning: learning as number };
  } catch {
    return null;
  }
};
const rememberLast = (mode: HomeMode, scope: string, summary: ProgressSummary) => {
  try {
    storage.write(homeLastKey(mode), JSON.stringify({ scope, mastered: summary.mastered, learning: summary.learning }));
  } catch { /* The gain line is a nicety; storage may be full or blocked. */ }
};

/** Word sessions Home can start, saved under vocabularySession's practice keys. A single word's practice is not one. */
const HOME_PRACTICE = /^(__more__|__weak__|__all__|topic:.+)$/;
const findPausedPractice = (): { id: string; title: string } | null => {
  try {
    for (const key of storage.keys(PRACTICE_SESSION_PREFIX)) {
      const id = key.slice(PRACTICE_SESSION_PREFIX.length);
      if (!HOME_PRACTICE.test(id)) continue;
      const snapshot = loadVocabularySession(allWords(), id);
      if (snapshot) return { id, title: snapshot.heading };
    }
  } catch { /* Storage unavailable: nothing to resume. */ }
  return null;
};

const Home: Component<HomeProps> = (props) => {
  const words = createMemo(() => vocabularyStore.getSelectedWords());
  const wordSession = loadVocabularySession(words());
  const [unreadableWordSession, setUnreadableWordSession] = createSignal(!wordSession && hasStoredVocabularySession());
  const [confirmWordDiscard, setConfirmWordDiscard] = createSignal(false);
  const [wordDiscardError, setWordDiscardError] = createSignal(false);
  let wordDialog: HTMLDivElement | undefined;
  createDialogFocus(confirmWordDiscard, () => wordDialog, () => setConfirmWordDiscard(false));
  /** Today's session covers the checked levels. A topic is practised from Temas, never as a filter on this. */
  const wordQueue = createMemo(() => vocabularyProgressStore.buildQueue(words()));
  const wordDaily = createMemo(() => vocabularyStore.getDailyWord());
  const wordPending = () => wordQueue().due.length + wordQueue().fresh.length;
  /** The chips show the HSK lists. */
  const wordLevels = vocabularyStore.getLists().flatMap((list) => list.hskLevel ?? []);
  const levelOn = (lvl: HskLevel) => vocabularyStore.isSelected(hskListId(lvl));
  const streak = () => progressStore.streak();
  const wordSummary = createMemo(() => summarizeProgress(words().map((word) => word.id), vocabularyProgressStore));
  const wordScope = () => [...vocabularyStore.state.selectedLists].sort().join(',');
  const previousWords = readLast('vocabulary', untrack(wordScope));
  rememberLast('vocabulary', untrack(wordScope), untrack(wordSummary));
  const pausedWord = wordSession
    ? { id: undefined as string | undefined, title: wordSession.heading }
    : findPausedPractice();
  const wordClosed = () => !unreadableWordSession() && !pausedWord && wordPending() === 0;

  /** What the CTA offers once nothing is pending today. The daily cap decides whether "more" is possible. */
  const wordNext = (): Step => {
    const unseen = words().filter((word) => vocabularyProgressStore.isNew(word.id)).length;
    const n = Math.min(10, unseen, vocabularyProgressStore.newLeftToday());
    if (n > 0) return { kind: 'more', n };
    if (wordSummary().weak > 0) return { kind: 'weak', n: wordSummary().weak };
    if (unseen === 0) return { kind: 'all' };
    return { kind: 'done' };
  };

  /** The levels are named on the line under the headline, so this one stays short. Extra study does not reopen the day. */
  const restLine = (next: Step, feminine: boolean) => {
    if (next.kind === 'all') return `Has visto ${feminine ? 'todas las palabras' : 'todo'}.`;
    return 'Hecho por hoy.';
  };

  /** Studied today and how many of them were new, from the progress itself, so the line only grows. */
  const studiedToday = (keys: string[], get: (key: string) => { lastSeen: number } | undefined) => {
    const start = new Date().setHours(0, 0, 0, 0);
    return keys.filter((key) => (get(key)?.lastSeen ?? 0) >= start).length;
  };
  const wordToday = () => ({
    studied: studiedToday(words().map((word) => word.id), (key) => vocabularyProgressStore.get(key)),
    fresh: vocabularyProgressStore.daily.introduced,
    noun: ['palabra', 'palabras'] as [string, string],
  });

  const wordLevelLabel = () => vocabularyStore.listLabel();

  const wordTodayLine = () => {
    const dueN = wordQueue().due.length;
    const freshN = wordQueue().fresh.length;
    if (dueN === 0 && freshN === 0) return restLine(wordNext(), true);
    const review = dueN === 1 ? '1 repaso' : `${dueN} repasos`;
    const fresh = `${freshN} ${agree(freshN, 'word', 'nuev')}`;
    if (dueN === 0) return `Hoy: ${fresh}.`;
    if (freshN === 0) return `Hoy: ${review}.`;
    return `Hoy: ${review} y ${fresh}.`;
  };

  const wordTodayAction = () => {
    const dueN = wordQueue().due.length;
    const freshN = wordQueue().fresh.length;
    if (dueN === 0) return `Aprender ${countNoun(freshN, 'word')}`;
    if (freshN === 0) return `Repasar ${countNoun(dueN, 'word')}`;
    return `Repasar ${dueN} y aprender ${freshN}`;
  };

  const wordModes = [
    {
      glyph: '搜',
      title: 'Buscar',
      body: 'Palabra, pinyin o significado',
      go: () => props.onNavigate({ page: 'vocabulario' }),
    },
    {
      glyph: '类',
      title: 'Temas',
      body: 'Familia, comida, verbos…',
      go: () => props.onNavigate({ page: 'vocabulario', topic: true }),
    },
    {
      glyph: '练',
      title: 'Repasar todo',
      body: 'Las palabras elegidas',
      go: () => props.onNavigate({ page: 'vocabulary-review', resume: false, practiceId: '__all__' }),
    },
    {
      glyph: '词',
      title: 'Mis palabras',
      body: 'Tu lista personal',
      go: () => props.onNavigate({ page: 'mis-palabras' }),
    },
    {
      glyph: '设',
      title: 'Opciones',
      body: 'Niveles, voz, copia',
      go: () => props.onNavigate({ page: 'opciones' }),
    },
  ];

  const masteredWordsIn = (lvl: (typeof wordLevels)[number]) =>
    vocabularyByLevel[lvl].filter((word) => vocabularyProgressStore.isMastered(word.id)).length;

  const learningWordsIn = (lvl: (typeof wordLevels)[number]) =>
    vocabularyByLevel[lvl].filter((word) => !vocabularyProgressStore.isNew(word.id) && !vocabularyProgressStore.isMastered(word.id)).length;

  /** Strokes and audio for newly ticked words download behind the page; the words themselves are already here. */
  const [mediaSave, setMediaSave] = createSignal<{ done: number; total: number }>();
  const [mediaFailed, setMediaFailed] = createSignal(false);
  let mediaRun = 0;
  const saveLevelMedia = () => {
    const run = ++mediaRun;
    setMediaFailed(false);
    setMediaSave({ done: 0, total: 0 });
    prepareListMedia(vocabularyStore.state.selectedLists, (done, total) => { if (run === mediaRun) setMediaSave({ done, total }); })
      .catch(() => { if (run === mediaRun) setMediaFailed(true); })
      .finally(() => { if (run === mediaRun) setMediaSave(undefined); });
  };
  const pickWordLevel = (lvl: (typeof wordLevels)[number]) => {
    const adding = !levelOn(lvl);
    vocabularyStore.toggleList(hskListId(lvl));
    if (adding) saveLevelMedia();
  };
  const mediaPercent = () => {
    const p = mediaSave();
    return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  };

  const wordPractice = (practiceId?: string) => {
    props.onNavigate({ page: 'vocabulary-review', resume: false, ...(practiceId ? { practiceId } : {}) });
  };
  /** The same choice the bottom button makes, for "o empezar otra" under a paused session. */
  const startWords = () => {
    if (wordPending() > 0) return wordPractice();
    const next = wordNext();
    wordPractice(next.kind === 'more' ? '__more__' : next.kind === 'weak' ? '__weak__' : next.kind === 'all' ? '__all__' : undefined);
  };
  const wordStart = () => (
    <Show
      when={wordPending() > 0}
      fallback={<NextAction
        next={wordNext()}
        onMore={() => wordPractice('__more__')}
        onAll={() => wordPractice('__all__')}
      />}
    >
      <button type="button" class="btn-ink h-14 w-full text-base" onClick={() => wordPractice()}>
        {wordTodayAction()}
        <Icon name="next" size={18} />
      </button>
    </Show>
  );

  return (
    <div class="h-[100dvh] w-full overflow-y-auto overscroll-contain">
    <div
      class="mx-auto flex min-h-full w-full max-w-[40rem] min-w-0 flex-col px-4"
      style={{ 'padding-top': 'max(env(safe-area-inset-top), 1.25rem)' }}
    >
      {/* Wordmark, streak, and the Palabras / Caracteres switch */}
      <div>
      <header class="flex items-center gap-3 animate-rise">
        <img src="/icon.svg" alt="" class="h-10 w-10 shrink-0 rounded-[0.7rem] shadow-lift rotate-[-3deg]" />
        <div class="min-w-0 flex-1 leading-tight">
          <div class="font-sans text-[1.375rem] font-semibold tracking-tight">Jiāyóu</div>
          <div class="truncate text-xs text-ink-faint">Vocabulario chino por niveles HSK</div>
        </div>
        <Show when={streak() > 0}>
          <div
            class="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 text-sm font-medium tabular-nums text-ink-soft"
            aria-label={`Racha de ${streak()} ${streak() === 1 ? 'día' : 'días'}`}
          >
            <span class="text-ink-faint">Racha</span>
            <span class="text-ink">{streak()}</span>
          </div>
        </Show>
        <ThemeToggle />
      </header>
      </div>

        <section class="sheet mt-4 p-5 animate-rise [animation-delay:60ms]">
          <p class="font-display text-[1.65rem] font-semibold leading-snug text-balance">
            {wordTodayLine()}
          </p>
          <p class="mt-0.5 text-sm text-ink-soft">De {wordLevelLabel()}</p>
          <HomeProgress summary={wordSummary()} feminine previous={previousWords} today={wordToday()} onWeak={() => props.onNavigate({ page: 'vocabulary-review', resume: false, practiceId: '__weak__' })} />
          <div class="mt-4">
            <LevelChips
              levels={wordLevels}
              isSelected={levelOn}
              onToggle={pickWordLevel}
              count={(lvl) => vocabularyByLevel[lvl].length}
              mastered={masteredWordsIn}
              learning={learningWordsIn}
              unit="palabras"
            />
            <Show when={mediaSave() && (mediaSave()!.total === 0 || mediaSave()!.done < mediaSave()!.total)}>
              <p class="mt-2 text-xs text-ink-soft tabular-nums" role="status">
                Descargando trazos y audios para usar sin conexión…{mediaSave()!.total > 0 ? ` ${mediaPercent()} %` : ''}
              </p>
            </Show>
            <Show when={mediaFailed()}>
              <p class="mt-2 text-xs text-seal" role="alert">
                No se pudieron descargar los trazos y audios. Las palabras ya están; lo demás se descargará cuando haya conexión.{' '}
                <button type="button" class="inline-flex min-h-11 items-center font-medium text-ink underline decoration-ink/30 underline-offset-4" onClick={saveLevelMedia}>
                  Reintentar
                </button>
              </p>
            </Show>
          </div>
          <Show when={!canLearnNew('word') && words().some((word) => vocabularyProgressStore.isNew(word.id))}>
            <CapNote limit={WORD_NEW_PER_DAY} kind="word" />
          </Show>
          <Show when={wordPending() === 0 && words().some((word) => vocabularyProgressStore.isNew(word.id)) === false}>
            <p class="mt-4 text-sm text-ink-soft">
              Has visto todas las palabras de esta lista.
              {wordLevels.some((level) => !levelOn(level))
                ? ' Marca otro nivel.'
                : ''}
            </p>
          </Show>
        </section>

        <ActivityCalendar activity={progressStore.activity()} />

        <button
          type="button"
          onClick={() => props.onNavigate({ page: 'vocabulario', wordId: wordDaily().id })}
          class="tile mt-4 flex items-center gap-3 p-3 text-left animate-rise [animation-delay:240ms] transition-transform active:scale-[0.99]"
          aria-label={`Palabra del día: ${wordDaily().simplified}. Ver ficha`}
        >
          <div class="relative h-[4.5rem] w-[4.5rem] flex-shrink-0">
            <RiceGrid class="absolute inset-0 h-full w-full" />
            <div
              class="absolute inset-0 flex items-center justify-center font-hanzi leading-none"
              lang="zh-CN"
              style={{ 'font-size': `min(2.75rem, ${4.2 / Math.max(1, wordDaily().characters.length)}rem)` }}
            >
              {wordDaily().simplified}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm text-ink-soft">Palabra del día</div>
            <div class="font-sans text-[1.15rem] font-semibold leading-snug first-letter:uppercase">
              {glossHead(wordDaily().meaning)}
            </div>
            <Pinyin text={wordDaily().pinyin} class="text-sm font-medium" />
          </div>
          <Icon name="next" size={18} class="flex-shrink-0 text-ink-faint" />
        </button>

        <nav class="mt-4 border-t border-line/80 animate-rise [animation-delay:90ms]">
          <For each={wordModes}>
            {(item) => (
              <button
                type="button"
                onClick={item.go}
                class="flex h-11 w-full items-center border-b border-line/80 text-left text-[0.9375rem] text-ink"
              >
                <span class="flex-1">{item.title}</span>
                <span class="mr-2 max-w-[11rem] truncate text-sm text-ink-soft">{item.body}</span>
                <Icon name="next" size={16} class="text-ink-faint" />
              </button>
            )}
          </For>
        </nav>

        <button
          type="button"
          onClick={() => props.onNavigate({ page: 'acerca' })}
          class="mx-auto mt-1 flex h-11 items-center justify-center px-4 text-sm text-ink-soft"
        >
          Acerca de
        </button>

        <div class={wordClosed() ? 'mt-auto pt-2' : 'pointer-events-none sticky bottom-0 z-10 -mx-4 mt-auto bg-gradient-to-t from-paper from-70% to-paper/0 px-4 pt-6 lg:static lg:mx-0 lg:bg-none lg:px-0 lg:pt-4 [&>*]:pointer-events-auto'} style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1rem)' }}>
          <Show when={unreadableWordSession()} fallback={
            <Show when={pausedWord} fallback={wordStart()}>
              {(paused) => (
                <>
                  <button
                    type="button"
                    class="btn-ink h-14 w-full text-base"
                    onClick={() => props.onNavigate({ page: 'vocabulary-review', resume: true, ...(paused().id ? { practiceId: paused().id } : {}) })}
                  >
                    Continuar sesión · {paused().title}
                    <Icon name="next" size={18} />
                  </button>
                  <button
                    type="button"
                    class="mx-auto mt-1 flex h-11 items-center px-4 text-sm text-ink-soft underline decoration-ink/30 underline-offset-4"
                    aria-label="Empezar otra sesión"
                    onClick={startWords}
                  >
                    o empezar otra
                  </button>
                </>
              )}
            </Show>
          }>
            <p class="mb-2 text-sm text-ink-soft">Hay una sesión de palabras que esta versión no puede abrir.</p>
            <button type="button" class="btn-quiet h-14 w-full" onClick={() => setConfirmWordDiscard(true)}>
              Descartar sesión guardada
            </button>
          </Show>
        </div>
    </div>
    <Show when={confirmWordDiscard()}>
      <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/55">
        <div ref={wordDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="word-discard-title" class="sheet w-full max-w-[40rem] px-4 pt-5 pb-6">
          <h2 id="word-discard-title" class="text-center font-display text-xl font-semibold">¿Descartar la sesión guardada?</h2>
          <p class="mt-2 text-center text-sm text-ink-soft">Se perderá esa sesión. El progreso guardado se conservará.</p>
          <button class="btn-ink mt-4 h-14 w-full" onClick={() => {
            if (!discardVocabularySession()) { setWordDiscardError(true); return; }
            setUnreadableWordSession(false);
            setConfirmWordDiscard(false);
          }}>Descartar sesión</button>
          <Show when={wordDiscardError()}><p role="alert" class="mt-2 text-center text-sm text-seal">No se pudo borrar la sesión.</p></Show>
          <button class="mt-1 h-11 w-full text-sm text-ink-soft" onClick={() => setConfirmWordDiscard(false)}>Cancelar</button>
        </div>
      </div>
    </Show>
    </div>
  );
};

export default Home;
