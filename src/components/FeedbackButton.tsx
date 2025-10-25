import posthog from 'posthog-js';
import { Component, createSignal, onMount } from 'solid-js';

const FeedbackButton: Component = () => {
    const [showPulse, setShowPulse] = createSignal(true);

    onMount(() => {
        // Detener la animación después de 3 repeticiones (3 segundos)
        setTimeout(() => {
            setShowPulse(false);
        }, 3000);
    });

    const handleFeedbackClick = () => {
        // Disparar evento custom de PostHog para abrir encuesta
        posthog.capture('open_feedback');
        console.log('Feedback event triggered');
    };

    return (
        <button
            onClick={handleFeedbackClick}
            class="fixed bottom-4 right-4 z-50 glass-button w-14 h-14 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
            title="Enviar feedback"
            aria-label="Enviar feedback"
        >
            <span class="text-2xl">💬</span>

            {/* Pulsing ring effect - 3 repeticiones */}
            {showPulse() && (
                <div class="absolute inset-0 rounded-full ping-limited opacity-20 bg-blue-400" />
            )}
        </button>
    );
};

export default FeedbackButton;

