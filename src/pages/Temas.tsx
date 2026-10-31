import { Component, For } from 'solid-js';
import Icon from '../components/Icon';
import TopBar from '../components/TopBar';
import { topics } from '../data/topics';
import { progressStore } from '../stores/progressStore';

interface TemasProps {
  onBack: () => void;
  onReview: (topicId: string) => void;
}

const Temas: Component<TemasProps> = (props) => (
  <div class="screen">
    <TopBar title="Temas" subtitle="Incluye HSK 1, 2 y 3" onBack={props.onBack} backLabel="Volver" />
    <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar mt-2">
      <For each={[...topics].sort((a, b) => a.title.localeCompare(b.title, 'es'))}>
        {(topic) => {
          const seen = () => topic.characters.filter((c) => progressStore.isSeen(c)).length;
          const total = topic.characters.length;
          return (
            <button
              onClick={() => props.onReview(topic.id)}
              aria-label={`${topic.title}, ${seen()} de ${total} caracteres`}
              class="w-full pt-2 text-left active:bg-ink/5"
            >
              <span class="flex items-center gap-3 min-h-11">
                <span class="font-hanzi text-2xl leading-none text-ink w-8 text-center" aria-hidden="true">
                  {topic.glyph}
                </span>
                <span class="min-w-0 flex-1 truncate font-medium">{topic.title}</span>
                <span class="w-[4.75rem] shrink-0 text-right text-sm text-ink-soft tabular-nums">
                  {seen()} de {total}
                </span>
                <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
              </span>
              <span class="mt-2 block h-px overflow-hidden bg-ink/20" aria-hidden="true">
                <span
                  class="block h-full bg-ink"
                  style={{ width: `${total ? (seen() / total) * 100 : 0}%` }}
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
