import { batch, Component, createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import SpeakButton from '../components/SpeakButton';
import GradeButtons, { GRADE_KEY } from '../components/GradeButtons';
import ScoreModal, { returnNoteText } from '../components/ScoreModal';
import SessionLeaveSheet from '../components/SessionLeaveSheet';
import SessionProgress from '../components/SessionProgress';
import TopBar from '../components/TopBar';
import Pinyin from '../components/Pinyin';
import RiceGrid from '../components/RiceGrid';
import { vocabulary, type VocabularyEntry } from '../data/vocabulary';
import { allWords, findWord } from '../stores/myWordsStore';
import { topicById } from '../data/topics';
import { vocabularyProgressStore as progress } from '../stores/vocabularyProgressStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { GRADES, SESSION_SIZE, WORD_NEW_PER_DAY, progressStore as charProgress, type Grade } from '../stores/progressStore';
import { discardVocabularySession, hasStoredVocabularySession, loadVocabularySession, saveVocabularySession, type Prompt } from '../utils/vocabularySession';
import { topicWords } from '../utils/topicPlan';
import { progressReset } from '../utils/progressReset';
import { shuffle } from '../utils/shuffle';
import { levelRank, orderForLearning } from '../utils/wordOrder';
import { characterStore } from '../stores/characterStore';
import { canSpeak, speakWord, stopSpeech } from '../utils/speech';

import { askGloss, interleave, pickChoices, type DeckCard } from '../domain/vocabulary/sessionDeck';
export { askGloss, askOrder, interleave, pickChoices } from '../domain/vocabulary/sessionDeck';

/** A miss comes back after this many cards, not at the very end. */
const REQUEUE_GAP = 4;

const TOPIC_PREFIX = 'topic:';
/** Ten new words past today's quota. */
const MORE_ID = '__more__';
/** Words missed at some point and not yet stable. */
const WEAK_ID = '__weak__';
const MORE_SIZE = 10;

const learningOrder = <T extends VocabularyEntry>(words: T[]) =>
  orderForLearning(words, characterStore.state.characters.map((row) => row.character));

/** Lower is worse: a word keeps the worst answer it got. */
const GRADE_RANK: Record<Grade, number> = { again: 0, hard: 1, good: 2 };

const isWeak = (entry: VocabularyEntry) => !progress.isNew(entry.id) && progress.isWeak(entry.id);

/** Groups of about three, as even as they split: ten words are 3, 4 and 3, never 3, 3, 3 and a lone word. */
/**
 * A word answered right once is also asked from the Spanish; after two, by ear as well.
 * Words never answered right keep the plain hanzi-to-meaning card.
 */
const withPrompts = (cards: DeckCard[]): DeckCard[] => {
  let turn = 0;
  const out = cards.map((card) => {
    const reps = progress.get(card.entry.id)?.reps ?? 0;
    if (card.kind !== 'review' || reps < 1) return card;
    const sides: readonly Prompt[] = reps >= 2 ? ['meaning', 'reverse', 'listen'] : ['meaning', 'reverse'];
    const prompt = sides[turn++ % sides.length];
    return prompt === 'meaning' ? card : { ...card, prompt };
  });
  // Every session trains the ear at least once: a word already reviewed if there is one, else
  // the recognition recall of a word taught earlier in the session. Never a pick card.
  if (canSpeak() && !out.some((card) => card.prompt === 'listen')) {
    const met = (card: DeckCard) => card.kind === 'review' && (progress.get(card.entry.id)?.reps ?? 0) >= 1;
    const target = out.find((card) => met(card) && !card.prompt)
      ?? out.find((card) => met(card) && card.prompt === 'reverse')
      ?? out.find((card) => card.kind === 'recall' && !card.prompt);
    if (target) out[out.indexOf(target)] = { ...target, prompt: 'listen' };
  }
  return out;
};

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase();

/**
 * The gloss as a card shows it: capitalised, without a leading copy of the pinyin.
 * "de (partícula posesiva)" under "de" reads as a stutter, so it becomes "Partícula posesiva".
 */
const displayGloss = (entry: VocabularyEntry) => {
  const head = entry.meaning.match(/^([^()]+?)\s*\((.+)\)$/);
  const text = head && plain(head[1]) === plain(entry.pinyin) ? head[2] : entry.meaning;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const topicTitle = (topicIds: string[]) => {
  const titles = topicIds.map((id) => topicById(id)?.title).filter((title): title is string => !!title);
  if (titles.length === 0) return 'Tema';
  if (titles.length <= 2) return titles.join(' y ');
  return `${titles.length} temas`;
};

/**
 * Due words first, then new ones within today's cap, then the rest, from the topics within the checked levels.
 * Once the cap is spent the topic is still worth a visit: its known words make a review.
 */
const topicDeck = (topicIds: string[]): DeckCard[] => {
  const source = topicWords(topicIds);
  const due = source.filter((entry) => progress.isDue(entry.id));
  const rest = source.filter((entry) => !progress.isDue(entry.id) && !progress.isNew(entry.id));
  const reviews = [...due, ...rest].map((entry) => ({ entry, kind: 'review' as const }));
  const fresh = learningOrder(source.filter((entry) => progress.isNew(entry.id))).slice(0, Math.min(progress.newLeftToday(), SESSION_SIZE));
  // Each new word brings two recall cards, so it takes three of the session's places.
  const reviewRoom = Math.max(0, SESSION_SIZE - fresh.length * 3);
  return withPrompts(interleave(reviews.slice(0, Math.max(reviewRoom, fresh.length ? 0 : SESSION_SIZE)), fresh));
};

interface Props {
  onBack: () => void;
  onStrokes: (char: string) => void;
  resume: boolean;
  practiceId?: string;
  /** Starts another word session, for example `__more__` from an empty review. */
  onPractice?: (practiceId: string) => void;
}

/** Another HSK word that shares a character, as a usage example. */
const relatedWord = (entry: VocabularyEntry) =>
  vocabulary.find((other) =>
    other.id !== entry.id &&
    other.simplified !== entry.simplified &&
    other.level <= Math.max(levelRank(entry), 2) &&
    other.characters.some((char) => entry.characters.includes(char)));

const VocabularyReview: Component<Props> = (props) => {
  const pool = vocabularyStore.getSelectedWords();
  const saved = (props.resume || props.practiceId) ? loadVocabularySession(allWords(), props.practiceId) : null;
  const allPractice = props.practiceId === '__all__';
  const morePractice = props.practiceId === MORE_ID;
  const weakPractice = props.practiceId === WEAK_ID;
  const topicIds = props.practiceId?.startsWith(TOPIC_PREFIX) ? props.practiceId.slice(TOPIC_PREFIX.length).split(',').filter(Boolean) : undefined;
  const topic = topicIds && topicIds.length > 0 ? { title: topicTitle(topicIds) } : undefined;
  const topicTotal = topicIds ? topicWords(topicIds).length : 0;
  /** The topic has unseen words but today's new words are spent: say so instead of blaming the levels. */
  const topicCapped = !!topicIds && progress.newLeftToday() === 0 && topicWords(topicIds).some((entry) => progress.isNew(entry.id));
  const special = allPractice || morePractice || weakPractice || !!topicIds;
  const selected = props.practiceId && !special ? findWord(props.practiceId) : undefined;
  const mode = saved?.mode ?? (allPractice ? 'practice' : selected && !progress.isNew(selected.id) && !progress.isDue(selected.id) ? 'practice' : 'today');
  const ordered = learningOrder(pool);
  const queue = progress.buildQueue(ordered);
  /** One name per flow, whatever the session holds: Hoy, Más palabras, Flojos, Repasar todo, or the topic. */
  const heading = topic ? topic.title : selected ? 'Práctica' : morePractice ? 'Más palabras' : weakPractice ? 'Flojos' : allPractice ? 'Repasar todo' : 'Hoy';
  const weakBefore = weakPractice ? pool.filter(isWeak).length : 0;
  /** The daily cap is spent, so a learn session has nothing to teach. */
  const capReached = morePractice && progress.newLeftToday() === 0;
  /** Only words already met: a recall quiz on a word never taught is a guess, not a review. */
  const seenDeck = (): DeckCard[] => withPrompts(shuffle(pool.filter((entry) => !progress.isNew(entry.id))).slice(0, SESSION_SIZE).map((entry) => ({ entry, kind: 'review' as const })));
  const moreDeck = (): DeckCard[] => withPrompts(interleave([], progress.buildQueue(ordered, MORE_SIZE).fresh));
  const weakDeck = (): DeckCard[] => shuffle(pool.filter(isWeak)).slice(0, SESSION_SIZE).map((entry) => ({ entry, kind: 'review' as const }));
  const savedDeck = saved?.deck.filter((card, index) => index < saved.position || card.kind !== 'learn' || progress.isNew(card.entry.id));
  const skippedCurrent = !!saved && savedDeck?.[saved.position] !== saved.deck[saved.position];
  const initialDeck: DeckCard[] = savedDeck ?? (allPractice ? seenDeck() : morePractice ? moreDeck() : weakPractice ? weakDeck() : topicIds ? topicDeck(topicIds) : props.practiceId ? (selected ? (progress.isNew(selected.id) ? interleave([], [selected]) : [{ entry: selected, kind: 'review' as const }]) : []) : withPrompts(interleave(
    queue.due.map((entry) => ({ entry, kind: 'review' as const })),
    queue.fresh,
  )));
  /** What this session's answers changed, as it was before. "Descartar" puts it back. */
  const checkpoint = saved?.checkpoint ? charProgress.resumeCheckpoint(saved.checkpoint) : charProgress.checkpoint();
  // Changes made on other screens while the session is paused are not the session's to undo.
  onCleanup(() => charProgress.closeCheckpoint(checkpoint));
  const [deck, setDeck] = createSignal<DeckCard[]>(initialDeck);
  const [position, setPosition] = createSignal(saved?.position ?? 0);
  const [revealed, setRevealed] = createSignal(skippedCurrent ? false : saved?.revealed ?? false);
  const [step, setStep] = createSignal<'learn' | 'seen' | 'ask' | 'check'>(skippedCurrent ? (initialDeck[saved?.position ?? 0]?.kind === 'learn' ? 'learn' : 'ask') : saved?.step ?? (initialDeck[0]?.kind === 'learn' ? 'learn' : 'ask'));
  const [feedback, setFeedback] = createSignal<Grade | null>(skippedCurrent ? null : saved?.feedback ?? null);
  /**
   * Each word's worst answer this session, retries after an Olvidé left out. The summary counts words by it,
   * so Olvidé in the summary is exactly the words listed to review.
   */
  const [results, setResults] = createSignal<Record<string, Grade>>(saved?.results ?? {});
  /** A session saved before results were kept still shows the counts it had. */
  const countsBefore = saved && !saved.results ? saved.counts : { again: 0, hard: 0, good: 0 };
  const counts = createMemo(() => {
    const out = { ...countsBefore };
    for (const grade of Object.values(results())) out[grade] += 1;
    return out;
  });
  const [error, setError] = createSignal(false);
  const [unreadable, setUnreadable] = createSignal(!saved && !!props.practiceId && hasStoredVocabularySession(props.practiceId));
  const [confirmDiscard, setConfirmDiscard] = createSignal(false);
  const [audioError, setAudioError] = createSignal(false);
  const [finished, setFinished] = createSignal(false);
  const [leaving, setLeaving] = createSignal(false);
  const [recovered, setRecovered] = createSignal(0);
  /** Words picked wrongly on the current pick card. The first wrong pick makes it Casi, the second Olvidé. */
  const [wrongPicks, setWrongPicks] = createSignal<string[]>([]);
  /** Answers given before a pause. Descartar undoes them too, so the leave sheet says how many. */
  const answeredBeforePause = saved ? saved.counts.again + saved.counts.hard + saved.counts.good : 0;
  const current = () => deck()[position()];
  /** Only cards the learner answers count. An introduction is reading, not answering. */
  const counter = () => {
    const answered = (cards: DeckCard[]) => cards.filter((card) => card.kind !== 'learn').length;
    // A deck saved before recalls were built in still adds them as it goes.
    const owed = deck().slice(position()).filter((card, index, rest) => card.kind === 'learn' && !rest.slice(index + 1).some((later) => later.kind === 'recall' && later.entry.id === card.entry.id)).length;
    return { done: answered(deck().slice(0, position())), left: answered(deck().slice(position())) + owed };
  };
  const items = () => new Set(deck().map((card) => card.entry.id)).size;
  /** Which side the card asks from. Learning and recall cards always show the word. */
  const prompt = (): Prompt => step() === 'learn' ? 'meaning' : current()?.prompt ?? 'meaning';
  const choices = createMemo(on(position, () => {
    const card = current();
    if (card?.prompt !== 'pick') return [];
    const shown = new Set(deck().slice(0, position()).map((earlier) => earlier.entry.id));
    return pickChoices(card.entry, pool, (entry) => shown.has(entry.id) || !progress.isNew(entry.id));
  }));
  /** The hanzi stays hidden while a reverse, listening or pick card is being answered. */
  const showWord = () => revealed() || prompt() === 'meaning';
  // A listening card speaks first: the sound is the question. A new word is heard as it is first shown.
  createEffect(on(() => [position(), prompt(), step()] as const, ([, kind, at]) => {
    const card = current();
    if (card && !revealed() && (kind === 'listen' || (at === 'learn' && canSpeak()))) speakWord(card.entry.pinyin, card.entry.simplified, () => setAudioError(true));
  }));
  const progressNote = () => topic ? `${items()} de ${topicTotal} palabras ${topicIds && topicIds.length > 1 ? 'de los temas' : 'del tema'}` : current()?.kind === 'learn' ? 'Palabra nueva' : undefined;
  /** Words that came back after an Olvidé, once each. */
  const missed = createMemo(() => {
    const result = results();
    return [...new Map(deck().filter((card) => result[card.entry.id] === 'again').map((card) => [card.entry.id, card.entry])).values()];
  });
  const practised = createMemo(() => [...new Map(deck().map((card) => [card.entry.id, card.entry])).values()]);
  const asItem = (entry: VocabularyEntry) => ({ character: entry.simplified, pinyin: entry.pinyin });
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => { if (timer) clearTimeout(timer); });
  /** A miss stays on screen until the learner taps Continuar, so the answer has time to sink in. */
  const [held, setHeld] = createSignal(false);

  createEffect(() => {
    if (!current() || finished() || unreadable()) return;
    setError(!saveVocabularySession({ version: 1, deck: deck(), position: position(), revealed: revealed(), step: step(), feedback: feedback(), counts: counts(), results: results(), heading, mode, checkpoint }, props.practiceId));
  });
  createEffect(on(progressReset, () => props.onBack(), { defer: true }));
  if (saved && !current()) {
    if (discardVocabularySession(props.practiceId)) setFinished(true);
    else setError(true);
  }

  const next = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    const nextPosition = position() + 1;
    if (nextPosition >= deck().length) {
      if (!discardVocabularySession(props.practiceId)) { setError(true); return; }
      setFinished(true);
      return;
    }
    batch(() => {
      setPosition(nextPosition);
      setRevealed(false);
      setWrongPicks([]);
      setFeedback(null);
      setHeld(false);
      setStep(deck()[nextPosition].kind === 'learn' ? 'learn' : 'ask');
    });
  };

  const teach = () => {
    const card = current();
    if (!card) return;
    if (!progress.isNew(card.entry.id)) { next(); return; }
    // Seeing a word is not learning it. It is enrolled when its recall card is graded,
    // so leaving or discarding now leaves progress as it was.
    const later = deck().slice(position() + 1).some((other) => other.kind === 'recall' && other.entry.id === card.entry.id);
    batch(() => {
      // Decks saved before recalls were built in get theirs here.
      if (!later) setDeck((old) => [...old, { entry: card.entry, kind: 'recall' }]);
      next();
    });
  };

  /** A word the learner already knows: enrolled as answered right, and its questions leave the session. */
  const alreadyKnown = () => {
    const card = current();
    if (!card || step() !== 'learn') return;
    if (progress.isNew(card.entry.id)) progress.grade(card.entry.id, 'good');
    batch(() => {
      setResults((old) => ({ ...old, [card.entry.id]: 'good' }));
      setDeck((old) => old.filter((other, index) => index <= position() || other.entry.id !== card.entry.id));
      next();
    });
  };

  const grade = (value: Grade) => {
    const card = current();
    if (!card || feedback() !== null || !revealed()) return;
    // Repasar todo still moves the schedule of what is due or weak; the rest stays free practice.
    if (mode === 'practice') progress.practice(card.entry.id, value, allPractice);
    else if (progress.isDue(card.entry.id) || (card.kind === 'recall' && (progress.get(card.entry.id)?.right ?? 0) + (progress.get(card.entry.id)?.wrong ?? 0) === 0)) progress.grade(card.entry.id, value);
    else progress.practice(card.entry.id, value, false);
    // A Bien in Flojos is what the session is for: the word leaves the weak list now.
    if (weakPractice && value === 'good' && progress.recoverWeak(card.entry.id)) setRecovered((n) => n + 1);
    // A retry after an Olvidé does not change the word's result: the summary keeps the miss.
    const retry = card.kind === 'review' && deck().slice(0, position()).some((earlier) => earlier.entry.id === card.entry.id);
    batch(() => {
      if (!retry) setResults((old) => {
        const before = old[card.entry.id];
        return { ...old, [card.entry.id]: before && GRADE_RANK[before] < GRADE_RANK[value] ? before : value };
      });
      if (value === 'again') {
        // The miss comes back the way it was asked: a production card is asked again as production.
        setDeck((old) => {
          const at = Math.min(position() + 1 + REQUEUE_GAP, old.length);
          return [...old.slice(0, at), { entry: card.entry, kind: 'review', ...(card.prompt ? { prompt: card.prompt } : {}) }, ...old.slice(at)];
        });
      }
      setFeedback(value);
      setStep('check');
    });
    // A miss, or a pick found after a wrong one, waits for Continuar. A clean answer moves on after a
    // short beat; a pick card stays a little longer so the right word and its sound land.
    const picked = card.prompt === 'pick';
    if (value === 'again' || (picked && wrongPicks().length > 0)) { setHeld(true); return; }
    timer = setTimeout(next, picked ? 1100 : 500);
  };

  /** A tap on one of the four words. Graded at once: no self-assessment on a production card. */
  const pick = (entry: VocabularyEntry) => {
    const card = current();
    if (!card || revealed() || feedback() !== null || wrongPicks().includes(entry.id)) return;
    if (entry.id === card.entry.id) {
      const misses = wrongPicks().length;
      setRevealed(true);
      grade(misses === 0 ? 'good' : misses === 1 ? 'hard' : 'again');
      // Hearing the word it just found closes the loop. The grade is already saved if audio fails.
      try { speakWord(card.entry.pinyin, card.entry.simplified, () => setAudioError(true)); } catch { setAudioError(true); }
      return;
    }
    const wrong = [...wrongPicks(), entry.id];
    setWrongPicks(wrong);
    if (wrong.length >= 2) {
      setRevealed(true);
      grade('again');
    }
  };
  const dontKnow = () => {
    if (revealed() || feedback() !== null) return;
    setRevealed(true);
    grade('again');
  };

  // A reload during feedback: the grade is already recorded, so move on.
  if (saved && current() && saved.feedback !== null && !skippedCurrent) next();

  const restart = (entries: VocabularyEntry[]) => {
    batch(() => {
      setDeck(entries.map((entry) => ({ entry, kind: 'review' as const })));
      setPosition(0);
      setRevealed(false);
      setFeedback(null);
      setStep('ask');
      setResults({});
      setFinished(false);
    });
  };

  const touched = () => !!saved || position() > 0 || feedback() !== null || Object.keys(results()).length > 0;
  const back = () => {
    if (finished() || !current() || unreadable()) { props.onBack(); return; }
    if (touched()) { setLeaving(true); return; }
    discardVocabularySession(props.practiceId);
    props.onBack();
  };
  const discardAndLeave = () => {
    // Undo the records this session changed, daily counts and streak included, then forget the session.
    charProgress.rollback(checkpoint);
    if (!discardVocabularySession(props.practiceId)) { setError(true); setLeaving(false); return; }
    setFinished(true);
    props.onBack();
  };

  const exitLabel = () => selected ? 'Volver a la palabra' : topic ? 'Volver al tema' : 'Volver al inicio';
  const emptyTitle = () => capReached || topicCapped ? `Ya has aprendido ${WORD_NEW_PER_DAY} palabras nuevas hoy` : topic ? `Nada que estudiar en ${topicIds && topicIds.length > 1 ? 'estos temas' : 'este tema'}` : allPractice ? 'Aún no hay palabras que repasar' : weakPractice ? 'No tienes palabras flojas' : morePractice ? 'No quedan palabras nuevas' : 'Todo al día';
  const emptyBody = () => topicCapped
    ? (topicIds && topicIds.length > 1 ? 'Estos temas te esperan mañana.' : 'Este tema te espera mañana.')
    : capReached
    ? 'Más palabras nuevas hoy se olvidan antes de mañana. Repasa las que ya conoces.'
    : topic ? `Marca otro nivel en Inicio para traer más palabras de ${topicIds && topicIds.length > 1 ? 'estos temas' : 'este tema'}.`
    : allPractice ? 'El repaso solo pregunta las palabras que ya has visto. Empieza aprendiendo unas pocas.'
    : weakPractice ? 'Ninguna palabra que hayas fallado sigue floja.'
    : morePractice ? 'Has visto todas las palabras de los niveles marcados. Marca otro nivel en Inicio.'
    : 'No te quedan palabras para repasar ahora.';
  /** The empty state's way forward: learning when there is nothing to review, review when the cap is spent. */
  const emptyAction = (): { label: string; id: string } | undefined => {
    if (!props.onPractice) return undefined;
    if (capReached && pool.some((entry) => !progress.isNew(entry.id))) return { label: 'Repasar palabras', id: '__all__' };
    if (allPractice && progress.newLeftToday() > 0 && pool.some((entry) => progress.isNew(entry.id))) return { label: 'Aprender 10 palabras', id: MORE_ID };
    return undefined;
  };
  /** Says when the misses really come back: a retry in this session already rescheduled most of them. */
  const returnNote = () => {
    if (allPractice) return 'Las que tocaban o estaban flojas cuentan como repaso. El resto fue práctica libre.';
    if (mode === 'practice') return 'Esta práctica no cambia cuándo vuelven.';
    return returnNoteText(missed().length, missed().filter((entry) => progress.isDue(entry.id)).length, 'palabra');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!current() || finished()) return;
      if (step() === 'learn') teach();
      else if (feedback() !== null) next();
      else if (!revealed() && prompt() !== 'pick') setRevealed(true);
    } else if (revealed() && feedback() === null && step() !== 'learn') {
      const value = GRADES.find((g) => GRADE_KEY[g] === event.key);
      if (value) grade(value);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => { window.removeEventListener('keydown', onKeyDown); stopSpeech(); });

  return (
    <div class="screen">
      <div class="animate-rise">
        <TopBar title={heading} onBack={back} backLabel="Volver" />
      </div>
      <Show when={!unreadable()} fallback={
        <div class="m-auto text-center animate-rise [animation-delay:60ms]">
          <p class="font-display text-xl">No se puede abrir la sesión guardada</p>
          <p class="mt-2 text-sm text-ink-soft">Puede pertenecer a una versión más reciente.</p>
          <Show when={!confirmDiscard()} fallback={<>
            <p class="mt-4 text-sm">¿Descartar esta sesión? El progreso se conservará.</p>
            <button class="btn-ink mt-3 min-h-12 w-full" onClick={() => {
              if (!discardVocabularySession(props.practiceId)) { setError(true); return; }
              setUnreadable(false);
            }}>Descartar sesión</button>
            <button class="btn-quiet mt-2 min-h-11 w-full" onClick={() => setConfirmDiscard(false)}>Cancelar</button>
          </>}><button class="btn-quiet mt-4 min-h-12 px-6" onClick={() => setConfirmDiscard(true)}>Descartar sesión guardada</button></Show>
          <Show when={error()}><p role="alert" class="mt-2 text-sm text-seal">No se pudo borrar la sesión.</p></Show>
        </div>
      }>
      <Show when={current() && !finished()} fallback={
        <Show when={!finished()}>
          <div class="m-auto max-w-[18rem] text-center animate-rise [animation-delay:60ms]">
            <RiceGrid class="mx-auto h-16 w-16 text-ink-faint" />
            <p class="mt-3 font-display text-2xl font-semibold">{emptyTitle()}</p>
            <p class="mt-2 text-sm text-ink-soft">{emptyBody()}</p>
            <Show when={emptyAction()} fallback={<button class="btn-ink mt-6 h-12 px-8" onClick={props.onBack}>{exitLabel()}</button>}>
              {(action) => <>
                <button class="btn-ink mt-6 h-12 w-full px-8" onClick={() => props.onPractice?.(action().id)}>{action().label}</button>
                <button class="btn-quiet mt-2 h-11 w-full px-6 text-sm" onClick={props.onBack}>{exitLabel()}</button>
              </>}
            </Show>
          </div>
        </Show>
      }>
            <div class="flex min-h-0 flex-1 flex-col pb-5 pt-1 animate-rise [animation-delay:60ms]">
              <SessionProgress done={counter().done} left={counter().left} note={progressNote()} />
              <div class="sheet my-3 flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto p-4 text-center [@media(min-height:600px)]:justify-center">
                <Show when={prompt() !== 'meaning'}>
                  <p class="eyebrow mb-3">{prompt() === 'reverse' || prompt() === 'pick' ? 'Significado → palabra' : 'Escucha'}</p>
                </Show>
                <Show when={!showWord() && prompt() === 'pick'}>
                  <p class="text-[1.75rem] font-semibold leading-snug text-balance first-letter:uppercase">{askGloss(current().entry).text}</p>
                  <Show when={askGloss(current().entry).hint}>{(hint) => <p class="mt-1 text-sm text-ink-soft">{hint()}</p>}</Show>
                  <p class="mt-2 text-sm text-ink-soft">¿Cómo se dice «{askGloss(current().entry).text}»?</p>
                  <div class="mt-5 grid w-full max-w-[20rem] grid-cols-2 gap-2.5" role="group" aria-label="Elige la palabra">
                    <For each={choices()}>{(choice) => (
                      <button
                        type="button"
                        class="tile flex min-h-[4.5rem] items-center justify-center px-2 font-hanzi text-[1.75rem] leading-none transition active:scale-[0.97]"
                        classList={{ 'border-seal/60 bg-seal-soft text-ink-faint line-through decoration-seal/60': wrongPicks().includes(choice.id) }}
                        disabled={wrongPicks().includes(choice.id)}
                        aria-label={choice.simplified}
                        lang="zh-CN"
                        onClick={() => pick(choice)}
                      >
                        {choice.simplified}
                      </button>
                    )}</For>
                  </div>
                  <Show when={wrongPicks().length === 1}><p role="status" class="mt-3 text-sm text-seal">Esa no. Prueba otra vez.</p></Show>
                </Show>
                <Show when={!showWord() && prompt() !== 'pick'}>
                  <Show when={prompt() === 'reverse'} fallback={
                    <div class="flex flex-col items-center">
                      <SpeakButton word size="lg" pinyin={current().entry.pinyin} hanzi={current().entry.simplified} label="Escuchar otra vez" onUnavailable={() => setAudioError(true)} />
                      <p class="mt-6 text-sm text-ink-soft">¿Qué palabra es?</p>
                    </div>
                  }>
                    <p class="text-[1.75rem] font-semibold leading-snug text-balance first-letter:uppercase">{askGloss(current().entry).text}</p>
                    <Show when={askGloss(current().entry).hint}>{(hint) => <p class="mt-1 text-sm text-ink-soft">{hint()}</p>}</Show>
                    <SpeakButton word class="mt-3" pinyin={current().entry.pinyin} hanzi={current().entry.simplified} onUnavailable={() => setAudioError(true)} />
                    <p class="mt-6 text-sm text-ink-soft">¿Cómo se escribe «{askGloss(current().entry).text}»?</p>
                  </Show>
                </Show>
                <Show when={showWord()}>
                <div class="relative flex w-full shrink-0 items-center justify-center" style={{ "max-width": "min(19rem, 24dvh)" }} aria-label={current().entry.simplified} lang="zh-CN">
                  <For each={Array.from(current().entry.simplified)}>{(char) => (
                    <span class="relative flex aspect-square min-w-0 flex-1 items-center justify-center">
                      <RiceGrid class="absolute inset-0 h-full w-full" frame={false} />
                      <span aria-hidden="true" class="relative font-hanzi leading-none" style={{ 'font-size': `min(${current().entry.characters.length === 1 ? '8rem' : '5.5rem'}, ${22 / current().entry.characters.length}dvh, ${75 / current().entry.characters.length}vw)` }}>{char}</span>
                    </span>
                  )}</For>
                </div>
                </Show>
                <Show when={revealed() || step() === 'learn'}>
                  <Pinyin word text={current().entry.pinyin} class="mt-3 text-2xl font-medium" />
                  <p class="mt-2 text-2xl font-semibold leading-snug text-balance">{displayGloss(current().entry)}</p>
                  <Show when={current().entry.traditional !== current().entry.simplified}><p class="mt-2 text-sm text-ink-soft">Tradicional: {current().entry.traditional}</p></Show>
                  <SpeakButton word class="mt-2" pinyin={current().entry.pinyin} hanzi={current().entry.simplified} onUnavailable={() => setAudioError(true)} />
                  <Show when={relatedWord(current().entry)}>{(other) => (
                    <div class="mt-3 w-full max-w-[19rem] rounded-xl bg-paper/60 px-4 py-2 text-left">
                      <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">También en</p>
                      <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
                        <span class="font-hanzi text-[1.5rem] leading-none" lang="zh-CN">{other().simplified}</span>
                        <Pinyin word text={other().pinyin} class="text-base font-medium whitespace-nowrap" />
                      </p>
                      <p class="mt-0.5 text-sm text-ink-soft">{other().meaning.split(';')[0]}</p>
                    </div>
                  )}</Show>
                  <Show when={audioError()}><p role="status" class="mt-2 text-sm text-seal">No se pudo reproducir el audio. Comprueba la voz china del dispositivo.</p></Show>
                  <p class="mt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">Trazos</p>
                  <div class="mt-1.5 flex flex-wrap justify-center gap-2">
                    <For each={current().entry.characters}>{(char, index) => <button class="tile min-h-11 min-w-11 px-3 font-hanzi text-xl" onClick={() => props.onStrokes(char)} aria-label={current().entry.characters.filter((part) => part === char).length > 1 ? `Practicar trazos de ${char}, posición ${index() + 1} de ${current().entry.characters.length}` : `Practicar trazos de ${char}`}>{char}<Show when={current().entry.characters.filter((part) => part === char).length > 1}><span class="block font-sans text-xs text-ink-soft">{index() + 1} de {current().entry.characters.length}</span></Show></button>}</For>
                  </div>
                </Show>
                <Show when={feedback()}>{(value) => (
                  <p role="status" class="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold animate-pop" classList={{ 'bg-jade/15 text-jade': value() === 'good', 'bg-ink/10 text-ink': value() === 'hard', 'bg-seal/15 text-seal': value() === 'again' }}>
                    {value() === 'again' ? 'Vuelve en unas tarjetas' : value() === 'hard' ? 'Casi' : 'Bien'}
                  </p>
                )}</Show>
                <Show when={!revealed() && step() !== 'learn' && prompt() === 'meaning'}><p class="mt-8 text-sm text-ink-soft">¿Qué significa esta palabra?</p></Show>
              </div>
              <Show when={error() || progress.storageError()}><p role="alert" class="mb-2 text-sm text-seal">No se pudo guardar el progreso en este dispositivo.</p></Show>
              <Show when={step() === 'learn'} fallback={
                <Show when={revealed()} fallback={
                  <Show when={prompt() === 'pick'} fallback={<button class="btn-ink h-14 w-full" onClick={() => setRevealed(true)}>Mostrar respuesta</button>}>
                    <button class="btn-quiet h-14 w-full" onClick={dontKnow}>No lo sé</button>
                  </Show>
                }>
                  <Show when={held()} fallback={<GradeButtons onGrade={grade} disabled={feedback() !== null} suggested={feedback()} />}>
                    <button class="btn-ink h-14 w-full" onClick={next}>Continuar</button>
                  </Show>
                </Show>
              }>
                <div class="grid grid-cols-[1fr_2fr] gap-2">
                  <button class="btn-quiet h-14 px-3" onClick={alreadyKnown}>Ya la sé</button>
                  <button class="btn-ink h-14" onClick={teach}>Continuar</button>
                </div>
              </Show>
            </div>
      </Show>
      </Show>
      <SessionLeaveSheet open={leaving()} answeredBeforePause={answeredBeforePause} onStay={() => setLeaving(false)} onPause={props.onBack} onDiscard={discardAndLeave} />
      <ScoreModal
        summary={finished() ? { ...counts(), total: counts().again + counts().hard + counts().good, percentage: (() => { const total = counts().again + counts().hard + counts().good; return total ? Math.round(((counts().good + counts().hard / 2) / total) * 100) : 0; })(), streak: Math.max(progress.daily.streak, charProgress.daily.streak) } : null}
        weakChange={weakPractice && finished() ? { before: weakBefore, after: pool.filter(isWeak).length, recovered: recovered() } : undefined}
        weakNow={finished() ? pool.filter(isWeak).length : undefined}
        missed={missed().map(asItem)}
        practised={practised().map(asItem)}
        noun={{ one: 'palabra', many: 'palabras' }}
        returnNote={returnNote()}
        onReviewMissed={() => restart(missed())}
        onOpenStrokes={props.onStrokes}
        onGoHome={props.onBack}
        exitLabel={exitLabel()}
      />
    </div>
  );
};
export default VocabularyReview;
