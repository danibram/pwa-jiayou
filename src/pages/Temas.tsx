import { Component, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import TopBar from '../components/TopBar';
import { charactersInTopic, topicGap, topics } from '../data/topics';
import { characterStore, formatHskLevels } from '../stores/characterStore';
import { progressStore } from '../stores/progressStore';

interface TemasProps {
  onBack: () => void;
  onReview: (topicId: string) => void;
}

const Temas: Component<TemasProps> = (props) => (
  <div class="screen">
    <TopBar
      title="Temas"
      subtitle={formatHskLevels(characterStore.getAvailableLevels())}
      onBack={props.onBack}
      backLabel="Volver"
    />
    <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar mt-2">
      <For each={[...topics].sort((a, b) => a.title.localeCompare(b.title, 'es'))}>
        {(topic) => {
          const installed = () => charactersInTopic(topic.id, characterStore.state.characters);
          const seen = () => installed().filter((char) => progressStore.isSeen(char.character)).length;
          const ready = () => installed().length;
          const gap = () => topicGap(topic.id, characterStore.state.characters);
          const label = () => {
            const extra = gap();
            const here = `${seen()} de ${ready()}`;
            if (extra.missing === 0) return `${topic.title}, ${here} caracteres`;
            return `${topic.title}, ${here} caracteres, ${extra.missing} más en ${formatHskLevels(extra.levels)}`;
          };
          return (
            <button
              onClick={() => props.onReview(topic.id)}
              disabled={ready() === 0}
              aria-label={label()}
              class="w-full pt-2 text-left active:bg-ink/5 disabled:opacity-50"
            >
              <span class="flex items-center gap-3 min-h-11">
                <span class="font-hanzi text-2xl leading-none text-ink w-8 text-center" aria-hidden="true">
                  {topic.glyph}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{topic.title}</span>
                  <Show when={gap().missing > 0}>
                    <span class="block truncate text-xs text-ink-faint">
                      {gap().missing} más en {formatHskLevels(gap().levels)}
                    </span>
                  </Show>
                </span>
                <span class="w-[4.75rem] shrink-0 text-right text-sm text-ink-soft tabular-nums">
                  {seen()} de {ready()}
                </span>
                <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
              </span>
              <span class="mt-2 block h-px overflow-hidden bg-ink/20" aria-hidden="true">
                <span
                  class="block h-full bg-ink"
                  style={{ width: `${ready() ? (seen() / ready()) * 100 : 0}%` }}
                />
              </span>
            </button>
          );
        }}
      </For>
    </div>
  </div>
);

export default Temas;
