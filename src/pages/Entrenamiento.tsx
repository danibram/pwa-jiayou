import { Component, createSignal, onMount, Show } from 'solid-js';
import ScoreModal from '../components/ScoreModal';
import SwipeableCard from '../components/SwipeableCard';
import { characterStore } from '../stores/characterStore';
import { HSKCharacter } from '../types';

interface EntrenamientoProps {
    onGoHome: () => void;
}

const Entrenamiento: Component<EntrenamientoProps> = (props) => {
    const [shuffledChars, setShuffledChars] = createSignal<HSKCharacter[]>([]);
    const [currentIndex, setCurrentIndex] = createSignal(0);
    const [showFeedback, setShowFeedback] = createSignal<'correct' | 'incorrect' | null>(null);
    const [showScore, setShowScore] = createSignal(false);
    const [hasFlipped, setHasFlipped] = createSignal(false);

    onMount(() => {
        // Initialize with shuffled characters
        const chars = characterStore.getShuffledCharacters();
        setShuffledChars(chars);
    });

    const currentChar = () => shuffledChars()[currentIndex()];
    const total = () => shuffledChars().length;
    const results = () => characterStore.state.trainingResults;

    const handleAnswer = (isCorrect: boolean) => {
        // Record answer
        characterStore.recordAnswer(isCorrect);

        // Show visual feedback
        setShowFeedback(isCorrect ? 'correct' : 'incorrect');

        setTimeout(() => {
            setShowFeedback(null);

            // Advance to next character
            if (currentIndex() < total() - 1) {
                setCurrentIndex(currentIndex() + 1);
                setHasFlipped(false); // Reset for next character
            } else {
                // End of training
                setShowScore(true);
            }
        }, 500);
    };

    const advanceToNext = () => {
        // Only advance without recording answer (used when already recorded by viewing translation)
        setShowFeedback('incorrect'); // Show feedback because it was already an error
        setTimeout(() => {
            setShowFeedback(null);
            if (currentIndex() < total() - 1) {
                setCurrentIndex(currentIndex() + 1);
                setHasFlipped(false);
            } else {
                setShowScore(true);
            }
        }, 500);
    };

    const handleFlip = () => {
        // If hasn't flipped before, count as error immediately
        if (!hasFlipped()) {
            setHasFlipped(true);
            // Record error but DON'T advance - user decides when to advance
            characterStore.recordAnswer(false);
        }
    };

    const handleSwipeLeft = () => {
        // If already viewed translation, just advance without recording another error
        if (hasFlipped()) {
            advanceToNext();
        } else {
            // Normal behavior: record error and advance
            handleAnswer(false);
        }
    };

    const handleSwipeRight = () => {
        // If already viewed translation, just advance (already recorded as error)
        if (hasFlipped()) {
            advanceToNext();
        } else {
            // Normal behavior: record success and advance
            handleAnswer(true);
        }
    };

    const handleRepeat = () => {
        // Restart training
        const chars = characterStore.getShuffledCharacters();
        setShuffledChars(chars);
        setCurrentIndex(0);
        setShowScore(false);
        setHasFlipped(false);
        characterStore.startTraining();
    };

    const handleGoHome = () => {
        characterStore.resetTraining();
        props.onGoHome();
    };

    return (
        <div class="h-screen flex flex-col overflow-x-hidden w-full max-w-full overflow-y-hidden">
            {/* Compact header */}
            <div class="p-3 glass-card mx-3 mt-3 mb-3 flex-shrink-0">
                <div class="flex justify-between items-center">
                    <button
                        onClick={handleGoHome}
                        class="glass-button px-4 py-2 text-white hover:scale-105 active:scale-95 transition-transform flex items-center gap-2"
                    >
                        <span>←</span>
                        <span class="text-sm">Inicio</span>
                    </button>
                    <div class="text-base md:text-lg font-bold text-white">
                        🎯 HSK {characterStore.state.selectedLevel}
                    </div>
                    <div class="w-16" /> {/* Spacer */}
                </div>
            </div>

            {/* Card area */}
            <div class="flex-1 flex flex-col items-center justify-center p-2 min-h-0">
                <Show when={currentChar() && !showScore()} fallback={
                    <div class="text-center text-white/70">
                        <Show when={!showScore()}>
                            <p class="text-2xl mb-4">No hay caracteres disponibles</p>
                            <button
                                onClick={handleGoHome}
                                class="glass-button px-6 py-3 text-white"
                            >
                                Volver al inicio
                            </button>
                        </Show>
                    </div>
                }>
                    {/* Visual feedback */}
                    <Show when={showFeedback()}>
                        <div
                            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-9xl animate-bounce-subtle"
                        >
                            {showFeedback() === 'correct' ? '✓' : '✗'}
                        </div>
                    </Show>

                    {/* Indicator that translation was viewed */}
                    <Show when={hasFlipped() && !showFeedback()}>
                        <div class="absolute top-4 right-4 z-50 glass-card px-3 py-1 text-sm text-red-400 font-semibold">
                            ✗ Visto
                        </div>
                    </Show>

                    <div
                        classList={{
                            'opacity-50 scale-95': showFeedback() !== null,
                            'transition-all duration-300': true,
                        }}
                    >
                        <SwipeableCard
                            character={currentChar()}
                            onSwipeLeft={handleSwipeLeft}
                            onSwipeRight={handleSwipeRight}
                            onFlip={handleFlip}
                            showSwipeIndicators={false}
                        />
                    </div>
                </Show>
            </div>

            {/* Compact progress and buttons */}
            <div class="p-3 space-y-2 flex-shrink-0">
                {/* Compact inline stats */}
                <div class="flex justify-center items-center gap-4 text-sm">
                    <span class="text-white/70">
                        {currentIndex() + 1}/{total()}
                    </span>
                    <span class="text-green-400 flex items-center gap-1">
                        <span>✓</span>
                        <span class="font-semibold">{results().correct}</span>
                    </span>
                    <span class="text-red-400 flex items-center gap-1">
                        <span>✗</span>
                        <span class="font-semibold">{results().incorrect}</span>
                    </span>
                </div>

                {/* Compact answer buttons */}
                <div class="flex justify-center gap-3">
                    <button
                        onClick={handleSwipeRight}
                        disabled={showFeedback() !== null || !currentChar()}
                        class="glass-button px-8 py-4 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-all"
                    >
                        <span class="text-2xl">✓</span>
                    </button>

                    <button
                        onClick={handleSwipeLeft}
                        disabled={showFeedback() !== null || !currentChar()}
                        class="glass-button px-8 py-4 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-all"
                    >
                        <span class="text-2xl">✗</span>
                    </button>
                </div>
            </div>

            {/* Score modal */}
            <ScoreModal
                show={showScore()}
                result={characterStore.getTrainingResult()}
                onRepeat={handleRepeat}
                onGoHome={handleGoHome}
            />
        </div>
    );
};

export default Entrenamiento;

