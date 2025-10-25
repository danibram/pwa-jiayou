import { Component, createSignal, Show } from 'solid-js';
import LevelSelector from '../components/LevelSelector';
import { characterStore } from '../stores/characterStore';

interface HomeProps {
    onNavigate: (page: 'tarjetas' | 'entrenamiento') => void;
}

const Home: Component<HomeProps> = (props) => {
    const [showLevelSelector, setShowLevelSelector] = createSignal(false);
    const [selectedMode, setSelectedMode] = createSignal<'tarjetas' | 'entrenamiento' | null>(null);

    const handleModeSelect = (mode: 'tarjetas' | 'entrenamiento') => {
        setSelectedMode(mode);
        setShowLevelSelector(true);
    };

    const handleLevelSelect = (level: number) => {
        const mode = selectedMode();
        if (mode) {
            if (mode === 'entrenamiento') {
                characterStore.startTraining();
            }
            props.onNavigate(mode);
        }
    };

    return (
        <div class="min-h-screen flex flex-col items-center justify-center p-4 overflow-x-hidden w-full max-w-full">
            <Show when={!showLevelSelector()}>
                {/* Initial screen */}
                <div class="text-center space-y-12 max-w-2xl mx-auto">
                    {/* Main title */}
                    <div class="space-y-4">
                        <h1 class="text-8xl md:text-9xl font-bold text-white drop-shadow-2xl animate-bounce-subtle">
                            加油
                        </h1>
                        <p class="text-2xl md:text-3xl text-white/80 font-light">
                            HSK Flashcards
                        </p>
                        <p class="text-lg text-white/60">
                            Learn Chinese characters interactively
                        </p>
                    </div>

                    {/* Mode buttons */}
                    <div class="flex flex-col md:flex-row gap-6 px-4">
                        <button
                            onClick={() => handleModeSelect('tarjetas')}
                            class="glass-button p-8 flex flex-col items-center gap-4 group hover:scale-105 active:scale-95 transition-all"
                        >
                            <div class="text-6xl group-hover:animate-bounce-subtle">📚</div>
                            <div class="text-2xl font-bold text-white">Flashcards</div>
                            <div class="text-sm text-white/70 text-center">
                                Browse freely through characters
                            </div>
                        </button>

                        <button
                            onClick={() => handleModeSelect('entrenamiento')}
                            class="glass-button p-8 flex flex-col items-center gap-4 group hover:scale-105 active:scale-95 transition-all"
                        >
                            <div class="text-6xl group-hover:animate-bounce-subtle">🎯</div>
                            <div class="text-2xl font-bold text-white">Training</div>
                            <div class="text-sm text-white/70 text-center">
                                Test your knowledge
                            </div>
                        </button>
                    </div>

                    {/* Additional info */}
                    <div class="text-sm text-white/50 space-y-2">
                        <p>💡 Swipe cards to navigate</p>
                        <p>👆 Tap to see translation</p>
                    </div>
                </div>
            </Show>

            <Show when={showLevelSelector()}>
                {/* Level selector */}
                <div class="w-full max-w-4xl">
                    {/* Header with back button */}
                    <div class="glass-card p-4 mb-8">
                        <button
                            onClick={() => {
                                setShowLevelSelector(false);
                                setSelectedMode(null);
                            }}
                            class="glass-button px-6 py-2 text-white hover:scale-105 active:scale-95 transition-transform"
                        >
                            ← Back
                        </button>
                    </div>

                    {/* Title */}
                    <div class="text-center mb-8">
                        <h2 class="text-4xl font-bold text-white mb-4">
                            Select HSK Level
                        </h2>
                        <p class="text-white/70">
                            {selectedMode() === 'tarjetas'
                                ? 'Choose the character level you want to practice'
                                : 'Choose the level for your training'}
                        </p>
                    </div>

                    <LevelSelector onSelectLevel={handleLevelSelect} />
                </div>
            </Show>
        </div>
    );
};

export default Home;

