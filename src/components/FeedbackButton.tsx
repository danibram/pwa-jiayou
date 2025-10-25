import posthog from 'posthog-js';
import { Component } from 'solid-js';

const FeedbackButton: Component = () => {

    const handleFeedbackClick = () => {
        // Disparar evento custom de PostHog para abrir encuesta
        posthog.capture('open_feedback');
        console.log('Feedback event triggered');
    };

    return (
        <button
            onClick={handleFeedbackClick}
            class="fixed top-6 right-8 z-50 glass-button w-10 h-10 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
            title="Enviar feedback"
            aria-label="Enviar feedback"
        >
            <span class="text-2xl">💬</span>
            <div class="absolute inset-0 rounded-full ping-limited opacity-20 bg-blue-400" />
        </button>
    );
};

export default FeedbackButton;

