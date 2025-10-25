import { Component, Show } from 'solid-js';
import SwipeableCard from '../components/SwipeableCard';
import { characterStore } from '../stores/characterStore';
import { openInPleco } from '../utils/plecoIntegration';

interface TarjetasProps {
    onGoHome: () => void;
}

const Tarjetas: Component<TarjetasProps> = (props) => {
    const characters = () => characterStore.getCharactersByLevel();
    const currentChar = () => characters()[characterStore.state.currentIndex];
    const currentIndex = () => characterStore.state.currentIndex;
    const total = () => characters().length;

    const handleSwipeLeft = () => {
        characterStore.nextCharacter();
    };

    const handleSwipeRight = () => {
        characterStore.previousCharacter();
    };

    const handleOpenPleco = () => {
        if (currentChar()) {
            openInPleco(currentChar().character);
        }
    };

    return (
        <div class="h-screen flex flex-col overflow-x-hidden w-full max-w-full overflow-y-hidden">
            {/* Compact header */}
            <div class="p-3 glass-card mx-3 mt-3 mb-3 flex-shrink-0">
                <div class="flex justify-between items-center">
                    <button
                        onClick={props.onGoHome}
                        class="glass-button px-4 py-2 text-white hover:scale-105 active:scale-95 transition-transform flex items-center gap-2"
                    >
                        <span>←</span>
                        <span class="text-sm">Inicio</span>
                    </button>
                    <div class="text-base md:text-lg font-bold text-white">
                        HSK {characterStore.state.selectedLevel}
                    </div>
                    <div class="w-16" /> {/* Spacer */}
                </div>
            </div>

            {/* Card area */}
            <div class="flex-1 flex flex-col items-center justify-center p-2 min-h-0">
                <Show when={currentChar()} fallback={
                    <div class="text-center text-white/70">
                        <p class="text-2xl mb-4">No hay caracteres disponibles</p>
                        <button
                            onClick={props.onGoHome}
                            class="glass-button px-6 py-3 text-white"
                        >
                            Volver al inicio
                        </button>
                    </div>
                }>
                    <SwipeableCard
                        character={currentChar()}
                        onSwipeLeft={handleSwipeLeft}
                        onSwipeRight={handleSwipeRight}
                        showSwipeIndicators={true}
                    />
                </Show>
            </div>

            {/* Compact controls and progress */}
            <div class="p-3 space-y-2 flex-shrink-0">
                {/* Inline counter */}
                <div class="text-center text-white/70 text-sm">
                    {currentIndex() + 1} / {total()}
                </div>

                {/* Compact navigation buttons */}
                <div class="flex justify-center gap-2">
                    <button
                        onClick={handleSwipeRight}
                        disabled={total() === 0}
                        class="glass-button px-6 py-3 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform text-xl"
                        title="Anterior"
                    >
                        ←
                    </button>

                    <button
                        onClick={handleOpenPleco}
                        disabled={!currentChar()}
                        class="glass-button px-6 py-3 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform text-xl"
                        title="Abrir en Pleco"
                    >
                        🔍
                    </button>

                    <button
                        onClick={handleSwipeLeft}
                        disabled={total() === 0}
                        class="glass-button px-6 py-3 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform text-xl"
                        title="Siguiente"
                    >
                        →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Tarjetas;

