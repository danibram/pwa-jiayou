import { leadSense } from '../data/wordSenses';
import { Component, createMemo, createResource, createSignal, For, Show, untrack } from 'solid-js';
import Icon from '../components/Icon';
import RiceGrid from '../components/RiceGrid';
import ThemeToggle from '../components/ThemeToggle';
import HomeProgress from '../components/HomeProgress';
import LevelChips from '../components/LevelChips';
import { studyStatusOf, summarizeLearning } from '../utils/progressSummary';
import { readHomeSnapshot, rememberHomeSnapshot } from '../utils/homeSnapshot';
import { agree, countNoun, type NounKind } from '../utils/countNoun';
import { activityStreak } from '../utils/activityStreak';
import ActivityCalendar from '../components/ActivityCalendar';
import Pinyin from '../components/Pinyin';
import type { HomeTarget } from '../screen';
import { levelWords, wordCount } from '../data/vocabulary';
import { vocabularyStore } from '../stores/vocabularyStore';
import { wordItemId } from '../stores/learningStore';
import { useLearningStore } from '../components/LearningStoreContext';
import { prepareListMedia } from '../utils/levelPacks';
import { hskListId } from '../data/lists';
import type { HskLevel } from '../types';
import { ALL_ID, MORE_ID, practiceIdOf, WEAK_ID } from '../utils/wordSessions';

interface HomeProps {
  onNavigate: (target: HomeTarget) => void;
}

type Step = { kind: 'more'; n: number } | { kind: 'weak'; n: number } | { kind: 'all' } | { kind: 'done' };

/**
 * Under a closed day. The headline already says "Hecho por hoy", so there is no second button
 * saying it again: any extra study is a quiet link, and nothing is pinned over the page.
 */
const NextAction: Component<{
  next: Step;
  onMore: () => void;
  onAll: () => void;
}> = (props) => {
  const extra = () => {
    const next = props.next;
    // Flojos already has its own link in the progress card.
    if (next.kind === 'more') return { label: `aprender ${next.n} más`, go: props.onMore };
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
          Lo nuevo se fija repasándolo en los días siguientes. Con {countNoun(props.limit, props.kind)} {agree(props.limit, props.kind, 'nuev')} al día, los repasos no se acumulan y se te queda más.
        </p>
      </Show>
    </div>
  );
};

const Home: Component<HomeProps> = (props) => {
  const store = useLearningStore();
  const words = createMemo(() => vocabularyStore.getSelectedWords());
  const itemIds = createMemo(() => words().map((word) => wordItemId(word.id)));
  /** Hoy as it would start now. Its counts are the session's own, so the button says what the session does. */
  const today = createMemo(() => store.previewPlan('today'));
  const moreWords = createMemo(() => store.previewPlan('more-words'));
  const statusOf = (wordId: string) => studyStatusOf(store.status(wordItemId(wordId)));
  const wordDaily = createMemo(() => vocabularyStore.getDailyWord(statusOf));
  const dueN = () => today()?.counts.scheduled ?? 0;
  const freshN = () => today()?.counts.newItems ?? 0;
  const wordPending = () => today()?.cards.length ?? 0;
  /** The chips show the HSK lists. */
  const wordLevels = vocabularyStore.getLists().flatMap((list) => list.hskLevel ?? []);
  const levelOn = (lvl: HskLevel) => vocabularyStore.isSelected(hskListId(lvl));
  /** Words and characters share one calendar, read from the learning log. */
  const activity = createMemo(() => store.activityByDay());
  const streak = () => activityStreak(activity(), new Date(store.now()));
  const wordSummary = createMemo(() => summarizeLearning(itemIds(), store));
  const wordScope = () => [...vocabularyStore.state.selectedLists].sort().join(',');
  const previousWords = readHomeSnapshot('vocabulary', untrack(wordScope));
  rememberHomeSnapshot('vocabulary', untrack(wordScope), untrack(wordSummary));
  /**
   * A stored word session still has cards: Home offers to continue the most recently started one.
   * Each mode keeps its own session, and Trazos resumes its own.
   */
  const [paused] = createResource(() => store.ready(), async () => {
    const session = (await store.activeSessions()).find((candidate) => candidate.mode !== 'strokes');
    return session ? practiceIdOf(session) : null;
  });
  const pausedWord = () => (paused.state === 'ready' ? paused() : null);
  const wordClosed = () => !pausedWord() && wordPending() === 0;
  const unseen = () => words().filter((word) => statusOf(word.id) === 'new').length;
  const newPerDay = () => store.settings().newPerDay['word-meaning'];
  /** The whole day's budget is spent, not only Hoy's share. */
  const capReached = () => store.newLeftToday('other') === 0;

  /** What the CTA offers once nothing is pending today. Más palabras' own plan decides whether "more" is possible. */
  const wordNext = (): Step => {
    const n = moreWords()?.counts.newItems ?? 0;
    if (n > 0) return { kind: 'more', n };
    if (wordSummary().weak > 0) return { kind: 'weak', n: wordSummary().weak };
    if (unseen() === 0) return { kind: 'all' };
    return { kind: 'done' };
  };

  /** The levels are named on the line under the headline, so this one stays short. Extra study does not reopen the day. */
  const restLine = (next: Step, feminine: boolean) => {
    if (next.kind === 'all') return `Has visto ${feminine ? 'todas las palabras' : 'todo'}.`;
    return 'Hecho por hoy.';
  };

  /** Words answered or taught today, and how many of them were new, from the log, so the line only grows. */
  const wordToday = () => {
    const day = new Date(store.now()).toLocaleDateString('sv-SE');
    const voided = new Set(store.events().flatMap((event) => (event.type === 'attempt-voided' ? [event.targetEventId] : [])));
    const studied = new Set(store.events().filter((event) => event.type !== 'attempt-voided' && event.localDay === day && !voided.has(event.id)).map((event) => event.itemId));
    return {
      studied: itemIds().filter((id) => studied.has(id)).length,
      fresh: today()?.counts.taughtToday ?? 0,
      noun: ['palabra', 'palabras'] as [string, string],
    };
  };

  const wordLevelLabel = () => vocabularyStore.listLabel();
  /** About eight seconds a card: a review is one card, a new word three (lesson, pick, recognition). */
  /** About eight seconds a card; a new word is two cards, the lesson and its practice. */
  const sessionMinutes = () => Math.max(1, Math.round((wordPending() * 8) / 60));
  const practisedToday = () => (activity()[new Date(store.now()).toLocaleDateString('sv-SE')] ?? 0) > 0;

  const wordTodayLine = () => {
    const due = dueN();
    const fresh = freshN();
    if (wordPending() === 0) return restLine(wordNext(), true);
    if (due === 0 && fresh === 0) return `Hoy: ${countNoun(wordPending(), 'word')}.`;
    const total = store.pendingToday();
    // A session takes a limited number of cards; the line says how many are really waiting.
    const review = total > due ? `${due} de ${total} repasos` : due === 1 ? '1 repaso' : `${due} repasos`;
    const freshText = `${fresh} ${agree(fresh, 'word', 'nuev')}`;
    if (due === 0) return `Hoy: ${freshText}.`;
    if (fresh === 0) return `Hoy: ${review}.`;
    return `Hoy: ${review} y ${freshText}.`;
  };

  const wordTodayAction = () => {
    const due = dueN();
    const fresh = freshN();
    if (due === 0 && fresh === 0) return 'Empezar';
    if (due === 0) return `Aprender ${countNoun(fresh, 'word')}`;
    if (fresh === 0) return `Repasar ${countNoun(due, 'word')}`;
    return `Repasar ${due} y aprender ${fresh}`;
  };

  /** The Trazos row says what a strokes session would do now, from the same plan the session builds. */
  const strokesPlan = createMemo(() => store.previewPlan('strokes'));
  const strokesBody = () => {
    const plan = strokesPlan();
    if (!plan) return 'Escribe caracteres';
    const due = plan.counts.scheduled;
    const fresh = plan.counts.newItems;
    if (due > 0) return `${due} por repasar`;
    if (fresh > 0) return `${fresh} ${fresh === 1 ? 'carácter nuevo' : 'caracteres nuevos'}`;
    return 'Al día';
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
      go: () => props.onNavigate({ page: 'vocabulary-review', resume: false, practiceId: ALL_ID }),
    },
    {
      glyph: '写',
      title: 'Trazos',
      get body() {
        return strokesBody();
      },
      go: () => props.onNavigate({ page: 'trazos', focus: { kind: 'level' } }),
    },
    {
      glyph: '设',
      title: 'Opciones',
      body: 'Niveles, voz, copia',
      go: () => props.onNavigate({ page: 'opciones' }),
    },
  ];

  const masteredWordsIn = (lvl: (typeof wordLevels)[number]) =>
    levelWords(lvl).filter((word) => statusOf(word.id) === 'mastered').length;

  const learningWordsIn = (lvl: (typeof wordLevels)[number]) =>
    levelWords(lvl).filter((word) => statusOf(word.id) === 'learning').length;

  /** A newly ticked level downloads its words, then their strokes and audio, behind the page. */
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
    wordPractice(next.kind === 'more' ? MORE_ID : next.kind === 'weak' ? WEAK_ID : next.kind === 'all' ? ALL_ID : undefined);
  };
  const wordStart = () => (
    <Show
      when={wordPending() > 0}
      fallback={<NextAction
        next={wordNext()}
        onMore={() => wordPractice(MORE_ID)}
        onAll={() => wordPractice(ALL_ID)}
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
          <div class="truncate text-xs text-ink-faint">Vocabulario chino HSK</div>
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
          <p class="mt-0.5 text-sm text-ink-soft">De {wordLevelLabel()}<Show when={wordPending() > 0}> · unos {sessionMinutes()} min</Show></p>
          <Show when={streak() > 0 && !practisedToday()}>
            <p class="mt-1 text-sm font-medium text-ink">Practica hoy para llegar a {streak() + 1} días seguidos.</p>
          </Show>
          <HomeProgress summary={wordSummary()} feminine previous={previousWords} today={wordToday()} onWeak={() => props.onNavigate({ page: 'vocabulary-review', resume: false, practiceId: WEAK_ID })} />
          <div class="mt-4">
            <LevelChips
              levels={wordLevels}
              isSelected={levelOn}
              onToggle={pickWordLevel}
              count={wordCount}
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
          <Show when={capReached() && unseen() > 0}>
            <CapNote limit={newPerDay()} kind="word" />
          </Show>
          <Show when={!capReached() && freshN() === 0 && unseen() > 0 && ((today()?.leftOutCounts['work-limit'] ?? 0) > 0 || (today()?.leftOutCounts['tomorrow-load'] ?? 0) > 0)}>
            <p class="mt-3 rounded-tile bg-line/30 px-3 py-2.5 text-sm text-ink-soft">
              Hoy toca ponerse al día. Las palabras nuevas vuelven cuando bajen los repasos.
            </p>
          </Show>
          <Show when={wordPending() === 0 && unseen() === 0}>
            <p class="mt-4 text-sm text-ink-soft">
              Has visto todas las palabras de esta lista.
              {wordLevels.some((level) => !levelOn(level))
                ? ' Marca otro nivel.'
                : ''}
            </p>
          </Show>
        </section>

        <ActivityCalendar activity={activity()} today={new Date(store.now())} />

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
              {leadSense(wordDaily().senses)}
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
          <Show when={pausedWord()} fallback={wordStart()}>
            {(session) => (
              <>
                <button
                  type="button"
                  class="btn-ink h-14 w-full text-base"
                  onClick={() => props.onNavigate({ page: 'vocabulary-review', resume: true, ...(session().practiceId ? { practiceId: session().practiceId } : {}) })}
                >
                  Continuar sesión · {session().title}
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
        </div>
    </div>
    </div>
  );
};

export default Home;
