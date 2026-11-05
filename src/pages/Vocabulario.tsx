import { Component, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { formatPinyinWord } from '../utils/pinyin';
import SpeakButton from '../components/SpeakButton';
import TopBar from '../components/TopBar';
import Pinyin from '../components/Pinyin';
import Icon from '../components/Icon';
import RiceGrid from '../components/RiceGrid';
import ResultRow from '../components/ResultRow';
import { statusWord, TopicBar, topicCountsLine, type StudyStatus, type TopicCounts } from '../components/TopicProgress';
import { rankBy, type Searchable } from '../utils/searchRank';
import { characterRecord, indexRowFor, searchCharacters } from '../utils/characterSearch';
import { glossHead } from '../utils/glossDisplay';
import { mainMeaning } from '../utils/meaning';
import CharacterDetailSheet from '../components/CharacterDetailSheet';
import SoundAlike, { type SoundAlikeItem } from '../components/SoundAlike';
import { familyByChar, linkedIds, markWord, wordSoundAlikes } from '../utils/wordDetail';
import { groupSenses, leadSense, sensesText, WORD_POS_LABELS } from '../data/wordSenses';
import StatusSeal from '../components/StatusSeal';
import WordRef from '../components/WordRef';
import WordRelations from '../components/WordRelations';
import { characterOrWordStub, type KnownCharacter } from '../utils/wordCharacter';
import { characterStore } from '../stores/characterStore';
import { progressStore as charProgress } from '../stores/progressStore';
import { charactersOfExtraTopicWords, extraVocabulary, vocabularyExample, type VocabularyEntry } from '../data/vocabulary';
import { listedThemes, subtopicsOf, topicById, topicScope, topicTags, topics } from '../data/topics';
import { EXTRA_LIST, hskLevelsOf } from '../data/lists';
import { stopSpeech } from '../utils/speech';
import { vocabularyStore } from '../stores/vocabularyStore';
import { wordItemId } from '../stores/learningStore';
import { useLearningStore } from '../components/LearningStoreContext';
import { studyStatusOf } from '../utils/progressSummary';

export interface VocabularyBrowseState {
  query: string;
  topic: string;
  scroll: number;
  choosingTopic: boolean;
}

interface Props {
  onBack: () => void;
  onStrokes: (char: string) => void;
  wordId?: string;
  onSelect: (id?: string) => void;
  onPractice: (id: string) => void;
  browse: VocabularyBrowseState;
  onBrowse: (state: VocabularyBrowseState) => void;
}

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** A search row: a word, or a character that is not a word on its own. */
type Row =
  | { kind: 'word'; word: VocabularyEntry; key: Searchable }
  | { kind: 'char'; char: KnownCharacter; key: Searchable };

const charRowOf = (char: KnownCharacter): Row => ({
  kind: 'char',
  char,
  key: { hanzi: [char.character, char.traditional], pinyin: char.pinyin, gloss: char.gloss ?? char.definition },
});

const wordRowOf = (word: VocabularyEntry): Row => ({
  kind: 'word',
  word,
  key: { hanzi: [word.simplified, word.traditional], pinyin: word.pinyin, gloss: sensesText(word.senses) },
});

/** Search rows are built once per word, not per keystroke or per selection change. */
const rowCache = new WeakMap<VocabularyEntry, Row>();
const wordRow = (word: VocabularyEntry): Row => {
  let row = rowCache.get(word);
  if (!row) rowCache.set(word, (row = wordRowOf(word)));
  return row;
};

/** Typing waits this long before the list filters, so each key stays instant. */
const SEARCH_DEBOUNCE_MS = 180;

const Vocabulario: Component<Props> = (props) => {
  const store = useLearningStore();
  const isNew = (id: string) => store.status(wordItemId(id)) === 'new';
  const isPending = (id: string) => store.isPendingToday(wordItemId(id));
  const [audioError, setAudioError] = createSignal(false);
  /** The character opened from this word's tiles, shown in the same detail as search. */
  const [charOpen, setCharOpen] = createSignal<string>();
  const openRecord = createMemo(() => {
    const char = charOpen();
    return char ? characterOrWordStub(char, characterStore.state.characters) : undefined;
  });
  const installedByChar = createMemo(() => new Map(characterStore.state.characters.map((row) => [row.character, row])));
  const charInstalled = (char: string) => installedByChar().has(char);
  const charStatus = (char: string): StudyStatus | undefined => {
    if (!charInstalled(char) || charProgress.isNew(char)) return undefined;
    return charProgress.isMastered(char) ? 'mastered' : 'learning';
  };
  onCleanup(stopSpeech);
  /** The checked lists. Buscar, Temas, the word page and its sections draw only from these. */
  const words = createMemo(() => vocabularyStore.getSelectedWords());
  /** A word of the checked lists, or a topic-tagged Extra word, which Temas lists even with Extra off. */
  const findWord = (id: string) =>
    vocabularyStore.findSelectedWord(id) ?? extraVocabulary.find((word) => word.id === id && word.topicIds.length > 0);
  /** Characters already listed as one-character words show up as words, not twice. */
  const wordGlyphs = createMemo(() => new Set(words().map((word) => word.simplified)));
  /**
   * Temas also lists Extra words tagged with a topic, even if the Extra list is off for Hoy.
   * Without a topic, the list stays the checked ones only.
   */
  const wordsForTopics = createMemo(() => {
    const selected = words();
    if (vocabularyStore.isSelected(EXTRA_LIST)) return selected;
    const seen = new Set(selected.map((word) => word.id));
    const extras = extraVocabulary.filter((word) => word.topicIds.length > 0 && !seen.has(word.id));
    return extras.length ? [...selected, ...extras] : selected;
  });
  const wordInScope = (word: VocabularyEntry, topicId: string) => {
    const scope = new Set(topicScope(topicId));
    return word.topicIds.some((id) => scope.has(id));
  };
  const availableThemes = createMemo(() =>
    listedThemes().filter((topic) => wordsForTopics().some((word) => wordInScope(word, topic.id))),
  );
  const availableTags = createMemo(() =>
    topicTags().filter((topic) => wordsForTopics().some((word) => word.topicIds.includes(topic.id))),
  );
  const selected = createMemo(() => (props.wordId ? findWord(props.wordId) : undefined));
  const update = (changes: Partial<VocabularyBrowseState>) => props.onBrowse({ ...props.browse, ...changes });
  /** `browse.topic` holds the one topic being practised, or '' for the whole list. */
  const chosenTopics = createMemo(() => (props.browse.topic ? [props.browse.topic] : []));
  const activeTopic = createMemo(() => (props.browse.topic ? topicById(props.browse.topic) : undefined));
  const themeSubtopics = createMemo(() => {
    const topic = activeTopic();
    if (!topic) return [];
    const themeId = topic.kind === 'subtopic' ? topic.parentId : topic.kind === 'theme' ? topic.id : undefined;
    if (!themeId) return [];
    return subtopicsOf(themeId).filter((sub) => wordsForTopics().some((word) => word.topicIds.includes(sub.id)));
  });
  const inTopics = (word: VocabularyEntry, ids: string[]) => {
    if (ids.length === 0) return true;
    const scope = new Set(ids.flatMap((id) => topicScope(id)));
    return word.topicIds.some((id) => scope.has(id));
  };
  const inPlan = createMemo(() => {
    const ids = new Set(words().map((word) => word.id));
    // Topic-tagged Extra words count as part of the plan in Temas even before Extra is checked.
    if (!vocabularyStore.isSelected(EXTRA_LIST)) {
      for (const word of extraVocabulary) {
        if (word.topicIds.length) ids.add(word.id);
      }
    }
    return ids;
  });
  const charInPlan = (char: KnownCharacter) => {
    if (char.hsk_level !== undefined) return hskLevelsOf(vocabularyStore.state.selectedLists).includes(char.hsk_level);
    return extraVocabulary.some((word) => word.characters.includes(char.character) && inPlan().has(word.id));
  };
  /** The characters of the levels being studied that are not also a word, built once rather than per keystroke. */
  const charRows = createMemo((): Row[] => {
    const installed = installedByChar();
    const glyphs = wordGlyphs();
    return searchCharacters('', characterStore.state.characters).flatMap((hit) => {
      const glyph = hit.kind === 'device' ? hit.character.character : hit.row.character;
      if (glyphs.has(glyph)) return [];
      const char = hit.kind === 'device' ? hit.character : installed.get(glyph) ?? characterRecord(glyph, []);
      if (!char || !charInPlan(char)) return [];
      return [charRowOf(char)];
    });
  });
  /** Characters of Extra words in this topic, so Temas teaches the pieces too. */
  const extraTopicCharRows = (ids: string[], listed: VocabularyEntry[]): Row[] =>
    charactersOfExtraTopicWords(ids, listed).flatMap((glyph) => {
      const char = characterOrWordStub(glyph, characterStore.state.characters);
      return char ? [charRowOf(char)] : [];
    });
  // The field shows each key at once; the list follows once typing pauses.
  const [typed, setTyped] = createSignal(props.browse.query);
  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  const setQuery = (query: string, now = false) => {
    setTyped(query);
    clearTimeout(typingTimer);
    if (now) update({ query, scroll: 0 });
    else typingTimer = setTimeout(() => update({ query, scroll: 0 }), SEARCH_DEBOUNCE_MS);
  };
  onCleanup(() => clearTimeout(typingTimer));
  const rows = createMemo((): Row[] => {
    const query = normalize(props.browse.query.trim());
    const ids = chosenTopics();
    // A search reaches the checked lists only; a topic browse uses the topic pool so tagged Extra words appear.
    const pool = ids.length > 0 ? wordsForTopics() : words();
    const listed = pool.filter((word) => inTopics(word, ids));
    const source = listed.map(wordRow);
    // Global search mixes in HSK characters; a topic also lists the pieces of its Extra words.
    if (query && ids.length === 0) source.push(...charRows());
    else if (ids.length > 0) source.push(...extraTopicCharRows(ids.flatMap((id) => topicScope(id)), listed));
    return rankBy(source, props.browse.query, (row) => row.key,
      (row) => (row.kind === 'word' ? inPlan().has(row.word.id) : charInPlan(row.char)));
  });
  const plural = (n: number) => (n === 1 ? '1 palabra' : `${n} palabras`);
  /** "3 palabras y 2 caracteres": characters are counted apart so the word count still means words. */
  const resultCount = () => {
    const chars = rows().filter((row) => row.kind === 'char').length;
    const words = plural(rows().length - chars);
    return chars ? `${words} y ${chars === 1 ? '1 carácter' : `${chars} caracteres`}` : words;
  };
  const countsFor = (ids: string[]): TopicCounts => {
    const counts = { total: 0, learning: 0, mastered: 0 };
    for (const word of wordsForTopics()) {
      if (!inTopics(word, ids)) continue;
      counts.total++;
      const status = statusOf(word.id);
      if (status === 'mastered') counts.mastered++;
      else if (status === 'learning') counts.learning++;
    }
    return counts;
  };
  const topicCounts = (topicId: string) => countsFor(topicScope(topicId));
  /** What the session will do today, after the daily cap, said before the tap. */
  const plan = createMemo(() => {
    const preview = store.previewPlan('topic', { kind: 'topics', topicIds: chosenTopics() });
    return {
      fresh: preview?.counts.newItems ?? 0,
      review: (preview?.counts.scheduled ?? 0) + (preview?.counts.practice ?? 0),
      capped: (preview?.leftOutCounts['new-budget-day'] ?? 0) > 0,
      waiting: (preview?.leftOutCounts['pending-elsewhere'] ?? 0) > 0,
    };
  });
  const studyLabel = () => {
    const { fresh, review } = plan();
    if (fresh === 0) return `Repasar ${review} de este tema`;
    const nuevas = fresh === 1 ? '1 nueva' : `${fresh} nuevas`;
    return review > 0 ? `Estudiar ${nuevas} + ${review} ${review === 1 ? 'repaso' : 'repasos'}` : `Estudiar ${nuevas}`;
  };
  const statusOf = (id: string): StudyStatus => studyStatusOf(store.status(wordItemId(id)));
  const newPerDay = () => store.settings().newPerDay['word-meaning'];
  const canLearnNew = () => store.newLeftToday('other') > 0;
  const topicTitle = (id: string) => topicById(id)?.title ?? id;
  /** Subtopic → parent theme; theme/tag → Temas list. */
  const back = () => {
    if (selected()) return props.onSelect(undefined);
    const current = activeTopic();
    if (current?.kind === 'subtopic' && current.parentId) {
      return update({ topic: current.parentId, query: '', scroll: 0 });
    }
    if (props.browse.topic) return update({ topic: '', query: '', choosingTopic: true, scroll: 0 });
    props.onBack();
  };

  const topicRow = (topic: (typeof topics)[number]) => (
    <li class="border-b border-line">
      <button
        type="button"
        class="w-full py-2.5 text-left active:bg-ink/5"
        aria-label={`${topic.title}, ${topicCountsLine(topicCounts(topic.id), true)}`}
        onClick={() => update({ topic: topic.id, choosingTopic: false, scroll: 0, query: '' })}
      >
        <span class="flex min-h-11 items-center gap-3">
          <span class="w-8 text-center font-hanzi text-2xl" lang="zh-CN" aria-hidden="true">{topic.glyph}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{topic.title}</span>
            <span class="block truncate text-xs text-ink-soft tabular-nums">{topicCountsLine(topicCounts(topic.id), true)}</span>
          </span>
          <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
        </span>
        <TopicBar counts={topicCounts(topic.id)} class="ml-11 mr-6 mt-1" />
      </button>
    </li>
  );
  let searchInput: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;
  const restoreScroll = (element: HTMLDivElement) => {
    list = element;
    queueMicrotask(() => { if (list === element) element.scrollTop = props.browse.scroll; });
  };
  onMount(() => { if (list) list.scrollTop = props.browse.scroll; });

  return (
    <div class="screen">
      <div class="animate-rise">
        <TopBar
          title={selected() ? 'Palabra' : props.browse.choosingTopic ? 'Temas' : props.browse.topic ? topicTitle(props.browse.topic) : 'Palabras'}
          onBack={back}
          backLabel="Volver"
        />
      </div>
      <Show when={selected()} fallback={
        <Show when={!props.browse.choosingTopic} fallback={
          <div class="flex min-h-0 flex-1 flex-col animate-rise [animation-delay:60ms]">
            <p class="mt-3 text-sm text-ink-soft">Elige un tema para ver sus palabras y practicarlas. Las cifras cuentan las palabras de {vocabularyStore.listLabel()}.</p>
            <div class="mt-2 min-h-0 flex-1 overflow-y-auto no-scrollbar">
              <ul aria-label="Temas">
                <For each={availableThemes()}>{(topic) => topicRow(topic)}</For>
              </ul>
              <Show when={availableTags().length}>
                <p class="mt-5 text-xs font-medium uppercase tracking-wide text-ink-faint">Etiquetas</p>
                <p class="mt-1 text-sm text-ink-soft">Se combinan con cualquier tema: una pregunta de precio también es Compras.</p>
                <ul class="mt-2" aria-label="Etiquetas">
                  <For each={availableTags()}>{(topic) => topicRow(topic)}</For>
                </ul>
              </Show>
            </div>
          </div>
        }>
          <Show when={themeSubtopics().length}>
            <div class="mt-3 flex flex-wrap gap-2 animate-rise [animation-delay:40ms]" role="group" aria-label="Subtemas">
              <button
                type="button"
                class="min-h-9 rounded-tile border-2 px-3 text-sm"
                classList={{
                  'border-ink bg-ink text-paper': activeTopic()?.kind === 'theme',
                  'border-line bg-surface text-ink-soft': activeTopic()?.kind !== 'theme',
                }}
                onClick={() => {
                  const themeId = activeTopic()?.kind === 'subtopic' ? activeTopic()!.parentId! : activeTopic()!.id;
                  update({ topic: themeId, scroll: 0, query: '' });
                }}
              >
                Todas
              </button>
              <For each={themeSubtopics()}>{(sub) => (
                <button
                  type="button"
                  class="min-h-9 rounded-tile border-2 px-3 text-sm"
                  classList={{
                    'border-ink bg-ink text-paper': props.browse.topic === sub.id,
                    'border-line bg-surface text-ink-soft': props.browse.topic !== sub.id,
                  }}
                  onClick={() => update({ topic: sub.id, scroll: 0, query: '' })}
                >
                  {sub.title}
                </button>
              )}</For>
            </div>
          </Show>
          <p class="mt-3 text-sm text-ink-soft animate-rise [animation-delay:60ms]">{vocabularyStore.listLabel()}</p>
          <label class="mt-3 block animate-rise [animation-delay:90ms]">
            <span class="sr-only">Buscar palabra, pinyin o significado</span>
            <span class="relative flex items-center">
              <Icon name="search" size={18} class="pointer-events-none absolute left-3 text-ink-faint" />
              <input type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck={false} value={typed()} onInput={(e) => setQuery(e.currentTarget.value)}
                ref={(el) => {
                  searchInput = el;
                  // Buscar from home has no topic; focus so the keyboard is ready.
                  if (el && !props.browse.topic) queueMicrotask(() => el.focus());
                }}
                placeholder="Palabra, pinyin o significado" class="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-11 text-base text-ink shadow-lift placeholder:text-ink-faint" />
              <Show when={typed()}>
                <button
                  type="button"
                  class="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full text-ink-faint hover:text-ink"
                  aria-label="Borrar búsqueda"
                  onClick={() => { setQuery('', true); searchInput?.focus(); }}
                >
                  <Icon name="close" size={16} />
                </button>
              </Show>
            </span>
          </label>
          <Show
            when={chosenTopics().length > 0}
            fallback={<p class="mt-3 text-xs text-ink-faint tabular-nums animate-rise [animation-delay:120ms]">{resultCount()}{props.browse.query.trim() ? ` en ${vocabularyStore.listLabel()}` : ''}</p>}
          >
            <div class="mt-3 animate-rise [animation-delay:120ms]">
              <p class="text-xs text-ink-soft tabular-nums">
                {props.browse.query.trim() ? `${resultCount()} · ` : ''}
                {topicCountsLine(countsFor(chosenTopics()), true)}
              </p>
              <TopicBar counts={countsFor(chosenTopics())} class="mt-1.5" />
            </div>
          </Show>
          <div ref={restoreScroll} onScroll={(e) => update({ scroll: e.currentTarget.scrollTop })} class="mt-1 min-h-0 flex-1 overflow-y-auto no-scrollbar animate-rise [animation-delay:140ms]">
            <For each={rows()} fallback={
              <div class="mt-6 text-center">
                <p class="text-sm font-medium text-ink">{chosenTopics().length ? 'Ninguna palabra coincide.' : 'Ninguna palabra ni carácter coincide.'}</p>
                <p class="mt-1 text-sm text-ink-soft">
                  {chosenTopics().length ? 'Revisa la ortografía o busca fuera de este tema.' : 'Revisa la ortografía o prueba con pinyin sin tonos.'}
                </p>
                <Show when={chosenTopics().length}>
                  <button type="button" class="btn-quiet mt-3 h-11 px-4 text-sm" onClick={() => update({ topic: '', scroll: 0 })}>Buscar en todas las palabras</button>
                </Show>
              </div>
            }>{(row) => row.kind === 'word' ? (() => {
              const word = row.word;
              return (
                <ResultRow
                  class="min-h-[4.5rem] py-2"
                  hanzi={word.simplified}
                  pinyin={word.pinyin}
                  meaning={leadSense(word.senses)}
                  level={word.level}
                  outsidePlan={!inPlan().has(word.id)}
                  status={inPlan().has(word.id) ? statusOf(word.id) : undefined}
                  label={`${word.simplified}, ${formatPinyinWord(word.pinyin)}, ${leadSense(word.senses)}, ${word.level ? `HSK ${word.level}` : 'Extra'}${inPlan().has(word.id) ? `, ${statusWord(statusOf(word.id), true)}` : ', fuera de tus niveles'}`}
                  onClick={() => props.onSelect(word.id)}
                />
              );
            })() : (() => {
              // A character opens its detail sheet over the list, so the search stays where it was.
              const char = row.char;
              const meaning = mainMeaning(char);
              const status = char.hsk_level !== undefined ? charStatus(char.character) : undefined;
              const levelLabel = char.hsk_level !== undefined ? `HSK ${char.hsk_level}` : 'tuyo';
              return (
                <ResultRow
                  class="min-h-[4.5rem] py-2"
                  hanzi={char.character}
                  pinyin={char.pinyin}
                  meaning={meaning}
                  level={char.hsk_level}
                  detail="Carácter"
                  notDownloaded={char.hsk_level !== undefined && !charInstalled(char.character)}
                  outsidePlan={!charInPlan(char)}
                  status={status}
                  label={`Carácter ${char.character}, ${char.pinyin}, ${meaning}, ${levelLabel}${status ? `, ${statusWord(status, false)}` : ''}`}
                  onClick={() => setCharOpen(char.character)}
                />
              );
            })()}</For>
          </div>
          <Show when={chosenTopics().length > 0 && countsFor(chosenTopics()).total > 0}>
            <Show
              when={plan().fresh + plan().review > 0}
              fallback={
                <div class="mt-3 flex h-14 w-full shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[0.9375rem] text-ink-soft" role="status">
                  {plan().waiting ? 'Primero, los repasos de Hoy' : 'Nuevas mañana'}
                </div>
              }
            >
              <button type="button" class="btn-ink mt-3 h-14 w-full shrink-0 text-base" onClick={() => props.onPractice(`topic:${props.browse.topic}`)}>
                {studyLabel()}
                <Icon name="next" size={18} />
              </button>
              <Show when={plan().capped}>
                <p class="mt-1.5 text-center text-xs text-ink-soft">Ya aprendiste las nuevas de hoy. Las de este tema siguen mañana.</p>
              </Show>
            </Show>
          </Show>
        </Show>
      }>
        {(word) => {
          const sounds = createMemo(() => wordSoundAlikes(word(), words(), findWord));
          /** Words shown in Palabras cercanas or Suena parecido stay out of the family below. */
          const shown = createMemo(() => new Set([...linkedIds(word(), findWord, words()), ...sounds().map((item) => item.word.id)]));
          const family = createMemo(() => familyByChar(word(), words(), 4, shown()));
          const single = () => word().characters.length === 1;
          return (
          <div class="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 animate-rise [animation-delay:60ms]">
            <div class="sheet flex flex-col items-center px-5 py-4 text-center">
              <div class="grid w-full grid-cols-[2.75rem_1fr_2.75rem] items-center">
                <span class="justify-self-start"><StatusSeal state={isNew(word().id) ? 'new' : isPending(word().id) ? 'due' : statusOf(word().id)} /></span>
                <p class="text-sm text-ink-soft">{word().level ? `HSK ${word().level}` : 'Extra'}</p>
                <SpeakButton
                  word
                  size="sm"
                  class="justify-self-end"
                  pinyin={word().pinyin}
                  hanzi={word().simplified}
                  onUnavailable={() => setAudioError(true)}
                />
              </div>
              {/* Each character opens its own detail: meaning, radical, strokes. */}
              <div class="flex w-full flex-1 items-center justify-center py-3 min-[400px]:py-6" lang="zh-CN" role="group" aria-label={word().simplified}>
                <For each={word().characters}>{(char, index) => (
                  <button
                    type="button"
                    class="relative aspect-square min-w-0 flex-1 max-w-[min(15rem,28svh)] rounded-tile transition-transform duration-150 active:scale-[0.97] hover:bg-line/20"
                    onClick={() => setCharOpen(char)}
                    aria-label={`Ver el carácter ${char}${word().characters.length > 1 ? `, ${index() + 1} de ${word().characters.length}` : ''}`}
                  >
                    <RiceGrid class="absolute inset-0 h-full w-full" frame={false} />
                    <svg viewBox="0 0 100 100" class="relative h-full w-full">
                      <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="90" font-weight="400" fill="currentColor" font-family='"WenKai HSK", "Kaiti SC", STKaiti, KaiTi, serif'>{char}</text>
                    </svg>
                  </button>
                )}</For>
              </div>
              {/* The card is the word itself: glyphs and sound. What it means is right below. */}
              <Pinyin word text={word().pinyin} class="text-[1.75rem] font-medium" />
              <Show when={word().traditional !== word().simplified}>
                <p class="mt-2 text-xs text-ink-faint">Tradicional <span lang="zh-TW" class="font-hanzi text-base text-ink-soft">{word().traditional}</span></p>
              </Show>
            </div>
            {/* Every use, right under the card: the first one leads, as on the review cards. */}
            <section class="mt-5 text-left" aria-label="Significados">
              <h3 class="sr-only">Significados</h3>
              <For each={groupSenses(word().senses)}>{(group, groupIndex) => (
                <div class="mt-3 first:mt-0" role="group" aria-label={group.pos ? WORD_POS_LABELS[group.pos] : 'Usos'}>
                  <Show when={group.pos}>{(pos) => <p class="eyebrow">{WORD_POS_LABELS[pos()]}</p>}</Show>
                  <ol class="mt-1 space-y-1.5">
                    <For each={group.senses}>{(sense, index) => (
                      <li class={`flex gap-2.5 leading-snug text-ink ${groupIndex() === 0 && index() === 0 ? 'text-[1.25rem] font-medium' : 'text-[0.9375rem]'}`}>
                        <span class="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
                        <span class="min-w-0">
                          <span class="first-letter:uppercase inline-block">{sense.text}</span>
                          {/* How it is used reads quieter than the use itself. */}
                          <Show when={sense.note}>{(note) => <span class="text-sm font-normal text-ink-soft"> ({note()})</span>}</Show>
                        </span>
                      </li>
                    )}</For>
                  </ol>
                </div>
              )}</For>
            </section>
            <div class="mt-5 text-center">
              <Show when={audioError()}><p role="status" class="mb-2 text-sm text-seal">No se pudo reproducir el audio. Comprueba la voz china del dispositivo.</p></Show>
              <div class="flex items-center gap-2">
                {/* Past today's limit a new word is still one tap away, but it reads as the exception it is. */}
                <Show
                  when={isNew(word().id) && !canLearnNew()}
                  fallback={<button class="btn-ink min-h-14 flex-1 px-6" onClick={() => props.onPractice(word().id)}>{isNew(word().id) ? 'Aprender palabra' : isPending(word().id) ? 'Repasar palabra' : 'Practicar palabra'}</button>}
                >
                  <button class="btn-quiet min-h-14 flex-1 px-6" onClick={() => props.onPractice(word().id)}>Aprender igualmente</button>
                </Show>
              </div>
              <Show when={isNew(word().id) && !canLearnNew()}>
                <p class="mt-2 text-xs text-ink-soft">Ya aprendiste las {newPerDay()} palabras nuevas de hoy. Esta iría por encima del límite.</p>
              </Show>
              <Show when={!isNew(word().id) && !isPending(word().id)}><p class="mt-2 text-xs text-ink-soft">Práctica libre, sin cambiar la fecha de repaso.</p></Show>
            </div>
            <Show when={vocabularyExample(word().simplified, word().example)}>
              {(example) => (
                <section class="mt-6 border-t border-line pt-5 text-left" aria-label="En una frase">
                  <h3 class="eyebrow">En una frase</h3>
                  <figure class="mt-2 border-l-2 border-line pl-4">
                    <p class="font-hanzi text-[1.375rem] leading-relaxed" lang="zh-CN">
                      {/* Every character opens its drawer, so a learner can look up the rest of the sentence. */}
                      <For each={markWord(example().chinese, word().simplified)}>{(part) => {
                        // Buttons are inline-block, so the mark is drawn on each one: an underline would not reach them.
                        const chars = (
                          <For each={[...part.text]}>{(c) => (
                            <Show when={/\p{Script=Han}/u.test(c)} fallback={c}>
                              <button type="button" class="active:bg-ink/10" classList={{ 'border-b-2 border-ink/60': part.hit }} aria-label={`${c} en la frase`} onClick={() => setCharOpen(c)}>{c}</button>
                            </Show>
                          )}</For>
                        );
                        return (
                          <Show when={part.hit} fallback={<span class="text-ink-soft">{chars}</span>}>
                            <mark class="bg-transparent text-ink">{chars}</mark>
                          </Show>
                        );
                      }}</For>
                    </p>
                    <figcaption class="mt-1 text-sm text-ink-soft">{example().spanish}</figcaption>
                  </figure>
                </section>
              )}
            </Show>
            <WordRelations word={word()} onOpenWord={props.onSelect} />
            <SoundAlike
              wide
              hint="Palabras que suenan casi igual. Al oírlas en una frase pueden confundirse."
              items={sounds().map((item): SoundAlikeItem => ({
                key: item.word.id,
                hanzi: item.word.simplified,
                pinyin: item.word.pinyin,
                gloss: leadSense(item.word.senses),
                match: item.match,
                level: item.level,
                onOpen: () => props.onSelect(item.word.id),
              }))}
            />
            {/* How the word is built. A one-character word is its own hero, so its row shows what the hero does not: radical and strokes. */}
            <section class="mt-6 border-t border-line pt-5 text-left" aria-label="Cómo se forma">
              <h3 class="eyebrow">{single() ? 'El carácter' : 'Cómo se forma'}</h3>
              <For each={family()}>{(block) => {
                const record = () => characterOrWordStub(block.char, characterStore.state.characters);
                const words = (
                  <ul class="grid grid-cols-2 gap-2" aria-label={`Otras palabras con ${block.char}`}>
                    <For each={block.words}>{(other) => (
                      <li classList={{ 'col-span-2': block.words.length === 1 }}>
                        <WordRef hanzi={other.simplified} pinyin={other.pinyin} gloss={leadSense(other.senses)} focus={block.char} row={block.words.length === 1} onOpen={() => props.onSelect(other.id)} />
                      </li>
                    )}</For>
                  </ul>
                );
                return (
                  <Show when={!single()} fallback={
                    <div class="mt-3">
                      <button
                        type="button"
                        class="tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-transform active:scale-[0.98]"
                        aria-label={`Ver el carácter ${block.char}: radical${record()?.radical && record()!.radical !== block.char ? ` ${record()!.radical}` : ''} y trazos`}
                        onClick={() => setCharOpen(block.char)}
                      >
                        <Show
                          when={record()?.radical && record()!.radical !== block.char ? record()!.radical : undefined}
                          fallback={<span lang="zh-CN" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-ink/5 font-hanzi text-[1.75rem] leading-none">{block.char}</span>}
                        >
                          {(radical) => <span lang="zh-CN" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-jade-soft/60 font-hanzi text-[1.75rem] leading-none text-jade">{radical()}</span>}
                        </Show>
                        <span class="min-w-0 flex-1">
                          <span class="block text-sm font-medium">Radical y trazos</span>
                          <span class="block truncate text-xs text-ink-soft">
                            <Show when={record()?.radical && record()!.radical !== block.char} fallback="Es un radical por sí mismo">
                              Radical {record()!.radical}{indexRowFor(record()!.radical) ? `, ${glossHead(indexRowFor(record()!.radical)!.gloss)}` : ''}
                            </Show>
                            <Show when={(record()?.stroke_count ?? 0) > 0}> · {record()!.stroke_count} trazos</Show>
                          </span>
                        </span>
                        <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
                      </button>
                      <Show when={block.words.length > 0}>
                        <p class="mt-4 text-xs font-medium text-ink-soft">Palabras con <span lang="zh-CN" class="font-hanzi text-sm">{block.char}</span></p>
                        <div class="mt-1.5">{words}</div>
                      </Show>
                    </div>
                  }>
                    <div class="mt-3">
                      <button
                        type="button"
                        class="flex min-h-14 w-full items-center gap-3 rounded-tile py-2 text-left active:bg-ink/5"
                        aria-label={record() ? `Ver el carácter ${block.char}, ${record()!.pinyin}, ${mainMeaning(record()!)}. Radical y trazos` : `Ver el carácter ${block.char}`}
                        onClick={() => setCharOpen(block.char)}
                      >
                        <span lang="zh-CN" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-ink/5 font-hanzi text-[1.75rem] leading-none">{block.char}</span>
                        <span class="min-w-0 flex-1">
                          <Show when={record()}>{(known) => (
                            <>
                              <Pinyin text={known().pinyin} class="block text-sm" />
                              <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{glossHead(mainMeaning(known()))}</span>
                            </>
                          )}</Show>
                        </span>
                        <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
                      </button>
                      <Show when={block.words.length > 0}><div class="ml-[1.375rem] mt-1 border-l-2 border-line pl-[1.125rem]">{words}</div></Show>
                    </div>
                  </Show>
                );
              }}</For>
            </section>
          </div>
          );
        }}
      </Show>
      <Show when={openRecord()}>
        {(record) => (
          <CharacterDetailSheet
            character={record()}
            installed={charInstalled(record().character)}
            currentWordId={props.wordId}
            onOpenCharacter={setCharOpen}
            status={charStatus(record().character)}
            onStrokes={() => {
              const char = record().character;
              setCharOpen(undefined);
              props.onStrokes(char);
            }}
            onOpenWord={(id) => {
              setCharOpen(undefined);
              if (id !== props.wordId) props.onSelect(id);
            }}
            onClose={() => setCharOpen(undefined)}
          />
        )}
      </Show>
    </div>
  );
};
export default Vocabulario;
