import { Component, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { formatPinyinWord } from '../utils/pinyin';
import SpeakButton from '../components/SpeakButton';
import TopBar from '../components/TopBar';
import Pinyin from '../components/Pinyin';
import Icon from '../components/Icon';
import RiceGrid from '../components/RiceGrid';
import ResultRow from '../components/ResultRow';
import { StatusTag, statusWord, TopicBar, topicCountsLine, type StudyStatus, type TopicCounts } from '../components/TopicProgress';
import { rankBy, type Searchable } from '../utils/searchRank';
import { characterRecord, searchCharacters } from '../utils/characterSearch';
import { wordParts } from '../utils/wordParts';
import { mainMeaning } from '../utils/meaning';
import CharacterDetailSheet from '../components/CharacterDetailSheet';
import ToneNeighbors from '../components/ToneNeighbors';
import WordRelations from '../components/WordRelations';
import { characterOrWordStub, type KnownCharacter } from '../utils/wordCharacter';
import { characterStore } from '../stores/characterStore';
import { progressStore as charProgress } from '../stores/progressStore';
import { topicPlan } from '../utils/topicPlan';
import { allWords, charactersOfExtraTopicWords, extraVocabulary, findWord, vocabulary, vocabularyExample, type VocabularyEntry } from '../data/vocabulary';
import { topics } from '../data/topics';
import { EXTRA_LIST, hskLevelsOf } from '../data/lists';
import { stopSpeech } from '../utils/speech';
import { vocabularyProgressStore as progress } from '../stores/vocabularyProgressStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { canLearnNew, WORD_NEW_PER_DAY } from '../stores/progressStore';

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
  key: { hanzi: [word.simplified, word.traditional], pinyin: word.pinyin, gloss: word.meaning },
});

const catalogRows = new Map<string, Row>([...vocabulary, ...extraVocabulary].map((word) => [word.id, wordRowOf(word)]));

/** Characters already listed as one-character words show up as words, not twice. */
const wordGlyphs = new Set(vocabulary.map((word) => word.simplified));

/** Typing waits this long before the list filters, so each key stays instant. */
const SEARCH_DEBOUNCE_MS = 180;

/** Up to six other words sharing a character, lower levels first, so the detail teaches a family. */
/** 一会儿 yíhuìr: a final 儿 read as -r is a spoken suffix, not 儿 "hijo". */
const erhua = (word: VocabularyEntry) => word.simplified.endsWith('儿') && word.characters.length > 1 && /[^e]r$/i.test(word.pinyin.trim().normalize('NFD').replace(/\p{M}/gu, ''));

const related = (word: VocabularyEntry): VocabularyEntry[] => {
  const chars = new Set(word.characters);
  // A shared 儿 that is only the erhua suffix in the other word teaches a false link.
  const shares = (other: VocabularyEntry) => other.characters.some((char) => chars.has(char) && !(char === '儿' && erhua(other) && other.characters.indexOf('儿') === other.characters.length - 1));
  return vocabulary
    .filter((other) => other.id !== word.id && shares(other))
    .sort((a, b) => a.level - b.level || a.characters.length - b.characters.length)
    .slice(0, 6);
};

const Vocabulario: Component<Props> = (props) => {
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
  const words = createMemo(() => vocabularyStore.getSelectedWords());
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
  const availableTopics = createMemo(() =>
    topics
      .filter((topic) => wordsForTopics().some((word) => word.topicIds.includes(topic.id)))
      .sort((a, b) => a.title.localeCompare(b.title, 'es')),
  );
  const selected = createMemo(() => (props.wordId ? findWord(props.wordId) : undefined));
  const wordRow = () => catalogRows;
  const update = (changes: Partial<VocabularyBrowseState>) => props.onBrowse({ ...props.browse, ...changes });
  /** `browse.topic` holds the one topic being practised, or '' for the whole list. */
  const chosenTopics = createMemo(() => (props.browse.topic ? [props.browse.topic] : []));
  const inTopics = (word: VocabularyEntry, ids: string[]) => ids.length === 0 || ids.some((id) => word.topicIds.includes(id));
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
  /** Every HSK character that is not also a word, built once rather than per keystroke. */
  const charRows = createMemo((): Row[] => {
    const installed = installedByChar();
    return searchCharacters('', characterStore.state.characters).flatMap((hit) => {
      const glyph = hit.kind === 'device' ? hit.character.character : hit.row.character;
      if (wordGlyphs.has(glyph)) return [];
      const char = hit.kind === 'device' ? hit.character : installed.get(glyph) ?? characterRecord(glyph, []);
      if (!char) return [];
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
    // A search reaches every level; a topic browse uses the topic pool so own tagged words appear.
    const pool = query ? allWords() : ids.length > 0 ? wordsForTopics() : words();
    const listed = pool.filter((word) => inTopics(word, ids));
    const source = listed.map((word) => wordRow().get(word.id)!);
    // Global search mixes in HSK characters; a topic also lists the pieces of its Extra words.
    if (query && ids.length === 0) source.push(...charRows());
    else if (ids.length > 0) source.push(...extraTopicCharRows(ids, listed));
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
      if (progress.isNew(word.id)) continue;
      if (progress.isMastered(word.id)) counts.mastered++;
      else counts.learning++;
    }
    return counts;
  };
  const topicCounts = (topicId: string) => countsFor([topicId]);
  /** What the session will do today, after the daily cap, said before the tap. */
  const plan = createMemo(() => topicPlan(chosenTopics()));
  const studyLabel = () => {
    const { fresh, review } = plan();
    if (fresh === 0) return `Repasar ${review} de este tema`;
    const nuevas = fresh === 1 ? '1 nueva' : `${fresh} nuevas`;
    return review > 0 ? `Estudiar ${nuevas} + ${review} ${review === 1 ? 'repaso' : 'repasos'}` : `Estudiar ${nuevas}`;
  };
  const statusOf = (id: string): StudyStatus =>
    progress.isNew(id) ? 'new' : progress.isMastered(id) ? 'mastered' : 'learning';
  const topicTitle = (id: string) => topics.find((topic) => topic.id === id)?.title ?? id;
  /** A topic is reached from the topic list, so leaving it goes back there. */
  const back = () => {
    if (selected()) return props.onSelect(undefined);
    if (props.browse.topic) return update({ topic: '', query: '', choosingTopic: true, scroll: 0 });
    props.onBack();
  };
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
            <ul class="mt-2 min-h-0 flex-1 overflow-y-auto no-scrollbar" aria-label="Temas">
              <For each={availableTopics()}>{(topic) => (
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
              )}</For>
            </ul>
          </div>
        }>
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
            fallback={<p class="mt-3 text-xs text-ink-faint tabular-nums animate-rise [animation-delay:120ms]">{resultCount()}{props.browse.query.trim() ? (extraVocabulary.length > 0 ? ' en HSK 1 a 6 y Extra' : ' en HSK 1 a 6') : ''}</p>}
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
              // A one-character HSK word opens the character sheet too; the sheet links on to the word.
              // One outside HSK (an Extra word like 喱) has no record, so it keeps its own word page.
              const single = word.characters.length === 1 && characterRecord(word.simplified, characterStore.state.characters);
              return (
                <ResultRow
                  class="min-h-[4.5rem] py-2"
                  hanzi={word.simplified}
                  pinyin={word.pinyin}
                  meaning={word.meaning}
                  level={word.level}
                  outsidePlan={!inPlan().has(word.id)}
                  status={inPlan().has(word.id) ? statusOf(word.id) : undefined}
                  label={`${word.simplified}, ${formatPinyinWord(word.pinyin)}, ${word.meaning}, ${word.level ? `HSK ${word.level}` : 'Extra'}${inPlan().has(word.id) ? `, ${statusWord(statusOf(word.id), true)}` : ', fuera de tus niveles'}`}
                  onClick={() => (single ? setCharOpen(word.simplified) : props.onSelect(word.id))}
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
                  Nuevas mañana
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
        {(word) => (
          <div class="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 animate-rise [animation-delay:60ms]">
            <div class="sheet flex min-h-[22rem] flex-col items-center px-5 py-4 text-center">
              <div class="grid w-full grid-cols-[2.75rem_1fr_2.75rem] items-center">
                <span aria-hidden="true" />
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
              <div class="flex w-full flex-1 items-center justify-center py-6" lang="zh-CN" role="group" aria-label={word().simplified}>
                <For each={word().characters}>{(char, index) => (
                  <button
                    type="button"
                    class="relative aspect-square min-w-0 flex-1 max-w-[15rem] rounded-tile transition-transform duration-150 active:scale-[0.97] hover:bg-line/20"
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
              {/* How the word is built: each character's own meaning, under its tile. */}
              <Show when={wordParts(word().characters).length > 0}>
                <div class="-mt-4 mb-3 flex w-full justify-center" aria-label="Significado de cada carácter">
                  <For each={wordParts(word().characters)}>{(part) => (
                    <p class="min-w-0 max-w-[15rem] flex-1 truncate px-1 text-center text-sm text-ink-soft">
                      <Show when={part.gloss} fallback="·">{part.gloss}</Show>
                    </p>
                  )}</For>
                </div>
              </Show>
              <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <Pinyin word text={word().pinyin} class="text-[1.75rem] font-medium" />
                <Show when={word().traditional !== word().simplified}>
                  <p class="flex items-center gap-1.5 border-l border-line pl-4 text-xs text-ink-soft">Tradicional <span lang="zh-TW" class="font-hanzi text-xl text-ink">{word().traditional}</span></p>
                </Show>
              </div>
              <p class="mt-1 text-[1.35rem] font-medium leading-snug text-ink first-letter:uppercase">{word().meaning}</p>
              <p class="mt-2 flex items-center justify-center gap-2">
                <StatusTag status={statusOf(word().id)} feminine />
                <Show when={!progress.isNew(word().id) && progress.isDue(word().id)}>
                  <span class="text-sm text-ink-soft">· para repasar hoy</span>
                </Show>
              </p>
            </div>
            <div class="mt-4 text-center">
              <Show when={audioError()}><p role="status" class="mb-2 text-sm text-seal">No se pudo reproducir el audio. Comprueba la voz china del dispositivo.</p></Show>
              <div class="flex items-center gap-2">
                {/* Past today's limit a new word is still one tap away, but it reads as the exception it is. */}
                <Show
                  when={progress.isNew(word().id) && !canLearnNew('word')}
                  fallback={<button class="btn-ink min-h-14 flex-1 px-6" onClick={() => props.onPractice(word().id)}>{progress.isNew(word().id) ? 'Aprender palabra' : progress.isDue(word().id) ? 'Repasar palabra' : 'Practicar palabra'}</button>}
                >
                  <button class="btn-quiet min-h-14 flex-1 px-6" onClick={() => props.onPractice(word().id)}>Aprender igualmente</button>
                </Show>
              </div>
              <Show when={progress.isNew(word().id) && !canLearnNew('word')}>
                <p class="mt-2 text-xs text-ink-soft">Ya aprendiste las {WORD_NEW_PER_DAY} palabras nuevas de hoy. Esta iría por encima del límite.</p>
              </Show>
              <Show when={!progress.isNew(word().id) && !progress.isDue(word().id)}><p class="mt-2 text-xs text-ink-soft">Práctica libre, sin cambiar la fecha de repaso.</p></Show>
            </div>
            <Show when={vocabularyExample(word().simplified)}>
              {(example) => (
                <section class="mt-6 border-t border-line pt-5 text-left" aria-label="Ejemplo de uso">
                  <p class="text-sm text-ink-soft">Ejemplo</p>
                  <p class="mt-2 font-hanzi text-xl" lang="zh-CN">{example().chinese}</p>
                  <p class="mt-1 text-sm text-ink-soft">{example().spanish}</p>
                </section>
              )}
            </Show>
            <Show when={[...word().simplified].length === 1}>
              <ToneNeighbors character={word().simplified} pinyin={word().pinyin} onOpenWord={props.onSelect} onOpenCharacter={setCharOpen} />
            </Show>
            <WordRelations word={word()} onOpenWord={props.onSelect} />
            <Show when={related(word()).length > 0}>
            <div class="mt-6 border-t border-line pt-5 text-left">
                <p class="text-sm text-ink-soft">Otras palabras con {[...new Set(word().characters)].join(' o ')}</p>
                <ul class="mt-1">
                  <For each={related(word())}>{(other) => (
                    <li class="border-b border-line/70 last:border-b-0">
                      <button type="button" class="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => props.onSelect(other.id)}>
                        <span lang="zh-CN" class="w-20 shrink-0 font-hanzi text-xl">{other.simplified}</span>
                        <span class="min-w-0 flex-1">
                          <Pinyin word text={other.pinyin} class="block text-sm" />
                          <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{other.meaning.split(';')[0]}</span>
                        </span>
                        <span class="shrink-0 text-xs tabular-nums text-ink-faint">HSK {other.level}</span>
                      </button>
                    </li>
                  )}</For>
                </ul>
            </div>
            </Show>
          </div>
        )}
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
