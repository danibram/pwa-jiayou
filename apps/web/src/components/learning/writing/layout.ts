/**
 * Widest a stroke canvas may grow. The canvas is square, so on a short window its width also sets
 * how much of the prompt and the buttons stays on screen; 25rem is roughly what they take.
 */
export const CANVAS_MAX = 'min(100%, max(13rem, calc(100dvh - 25rem)))';
