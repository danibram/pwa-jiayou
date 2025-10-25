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

    const handleLevelSelect = async (level: number) => {
        const mode = selectedMode();
        if (mode) {
            // Load level data asynchronously
            await characterStore.selectLevel(level);

            if (mode === 'entrenamiento') {
                characterStore.startTraining();
            }
            props.onNavigate(mode);
        }
    };

    return (
        <div class="min-h-screen flex flex-col items-center justify-center p-3 overflow-x-hidden w-full max-w-full">
            <Show when={!showLevelSelector()}>
                {/* Initial screen */}
                <div class="text-center space-y-6 max-w-2xl mx-auto">
                    {/* Main title */}
                    <div class="space-y-4">
                        <h1 class="text-8xl md:text-9xl font-bold text-white drop-shadow-2xl animate-bounce-subtle">
                            加油
                        </h1>
                        <p class="text-lg text-white/60">
                            Aprende caracteres en forma de tarjetas
                        </p>
                    </div>

                    {/* Mode buttons */}
                    <div class="flex flex-col md:flex-row gap-6 px-4">
                        <button
                            onClick={() => handleModeSelect('tarjetas')}
                            class="glass-button p-8 flex flex-col items-center gap-4 group hover:scale-105 active:scale-95 transition-all"
                        >
                            <div class="text-6xl group-hover:animate-bounce-subtle">📚</div>
                            <div class="text-2xl font-bold text-white">Tarjetas</div>
                            <div class="text-sm text-white/70 text-center">
                                Navega libremente por los caracteres
                            </div>
                        </button>

                        <button
                            onClick={() => handleModeSelect('entrenamiento')}
                            class="glass-button p-8 flex flex-col items-center gap-4 group hover:scale-105 active:scale-95 transition-all"
                        >
                            <div class="text-6xl group-hover:animate-bounce-subtle">🎯</div>
                            <div class="text-2xl font-bold text-white">Entrenamiento</div>
                            <div class="text-sm text-white/70 text-center">
                                Pon a prueba tus conocimientos
                            </div>
                        </button>
                    </div>

                    {/* Additional info */}
                    <div class="text-sm text-white/50 space-y-2">
                        <p>💡 Desliza las tarjetas para navegar</p>
                        <p>👆 Toca para ver la traducción</p>
                    </div>

                    <div class="text-sm text-white/50 space-y-2">
                        {"Made with "}
                        <span role="img" aria-label="heart">
                            ❤️
                        </span>
                        {" by "}
                        <a href="" rel="noopener noreferrer" target="_blank" class="hover:text-white/80 transition-colors">
                            Laura
                        </a>
                        {" & "}
                        <a href="https://dbr.io/" rel="noopener noreferrer" target="_blank" class="hover:text-white/80 transition-colors">
                            Dani
                        </a>
                    </div>

                    {/* GitHub link */}
                    <div class="text-sm text-white/40 mt-2">
                        <a
                            href="https://github.com/dbr/pwa-jiayou"
                            rel="noopener noreferrer"
                            target="_blank"
                            class="inline-flex items-center gap-2 hover:text-white/70 transition-colors group"
                        >
                            <svg class="w-5 h-5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
                            </svg>
                            <span>Ver en GitHub</span>
                        </a>
                    </div>

                </div>
            </Show>

            <Show when={showLevelSelector()}>
                {/* Level selector */}
                <div class="w-full max-w-4xl">
                    {/* Header with back button */}
                    <div class="glass-card p-3 mb-8">
                        <button
                            onClick={() => {
                                setShowLevelSelector(false);
                                setSelectedMode(null);
                            }}
                            class="glass-button px-4 py-2 text-white hover:scale-105 active:scale-95 transition-transform flex items-center gap-2 text-sm"
                        >
                            ← Atrás
                        </button>
                    </div>

                    {/* Title */}
                    <div class="text-center mb-8">
                        <h2 class="text-4xl font-bold text-white mb-4">
                            Selecciona el nivel HSK
                        </h2>
                        <p class="text-white/70">
                            {selectedMode() === 'tarjetas'
                                ? 'Elige el nivel de caracteres que quieres practicar'
                                : 'Elige el nivel para tu entrenamiento'}
                        </p>
                    </div>

                    <LevelSelector onSelectLevel={handleLevelSelect} />
                </div>
            </Show>
        </div>
    );
};

export default Home;

