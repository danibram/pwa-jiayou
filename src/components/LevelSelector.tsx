import { Component, For, createSignal } from 'solid-js';
import { characterStore } from '../stores/characterStore';

interface LevelSelectorProps {
  onSelectLevel?: (level: number) => void;
}

const LevelSelector: Component<LevelSelectorProps> = (props) => {
  const levels = [1, 2, 3, 4, 5, 6];
  const [loadingLevel, setLoadingLevel] = createSignal<number | null>(null);

  const handleSelect = async (level: number) => {
    setLoadingLevel(level);
    await characterStore.selectLevel(level);
    setLoadingLevel(null);
    props.onSelectLevel?.(level);
  };

  return (
    <div class="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-2xl mx-auto p-4">
      <For each={levels}>
        {(level) => {
          const count = characterStore.getCharacterCountByLevel(level);
          const isSelected = characterStore.state.selectedLevel === level;

          const isLoading = loadingLevel() === level;
          const isDisabled = count === 0;

          return (
            <button
              onClick={() => handleSelect(level)}
              disabled={isDisabled || isLoading}
              class="glass-button p-8 flex flex-col items-center justify-center gap-3 relative overflow-hidden group"
              classList={{
                'ring-4 ring-blue-400': isSelected,
                'opacity-50 cursor-not-allowed': isDisabled,
              }}
            >
              {/* Level badge */}
              <div class="text-5xl font-bold text-white group-hover:scale-110 transition-transform">
                HSK {level}
              </div>

              {/* Character counter or loading */}
              <div class="text-sm text-white/70">
                {isLoading ? (
                  <span class="animate-pulse">Cargando...</span>
                ) : isDisabled ? (
                  <span>Próximamente</span>
                ) : (
                  `${count} ${count === 1 ? 'carácter' : 'caracteres'}`
                )}
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

