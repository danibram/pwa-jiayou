import { Component, For } from 'solid-js';
import { characterStore } from '../stores/characterStore';

interface LevelSelectorProps {
  onSelectLevel?: (level: number) => void;
}

const LevelSelector: Component<LevelSelectorProps> = (props) => {
  const levels = [1, 2, 3, 4, 5, 6];

  const handleSelect = (level: number) => {
    characterStore.selectLevel(level);
    props.onSelectLevel?.(level);
  };

  return (
    <div class="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-2xl mx-auto p-4">
      <For each={levels}>
        {(level) => {
          const count = characterStore.getCharacterCountByLevel(level);
          const isSelected = characterStore.state.selectedLevel === level;

          return (
            <button
              onClick={() => handleSelect(level)}
              class="glass-button p-8 flex flex-col items-center justify-center gap-3 relative overflow-hidden group"
              classList={{
                'ring-4 ring-blue-400': isSelected,
              }}
            >
              {/* Level badge */}
              <div class="text-5xl font-bold text-white group-hover:scale-110 transition-transform">
                HSK {level}
              </div>

              {/* Character counter */}
              <div class="text-sm text-white/70">
                {count} {count === 1 ? 'character' : 'characters'}
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <div class="absolute top-2 right-2 text-blue-400">
                  ✓
                </div>
              )}

              {/* Hover effect */}
              <div class="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-all duration-300" />
            </button>
          );
        }}
      </For>
    </div>
  );
};

export default LevelSelector;

