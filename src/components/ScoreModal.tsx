import { Component, Show } from 'solid-js';
import { TrainingResult } from '../types';

interface ScoreModalProps {
  show: boolean;
  result: TrainingResult;
  onRepeat: () => void;
  onGoHome: () => void;
}

const ScoreModal: Component<ScoreModalProps> = (props) => {
  const getEmoji = () => {
    const percentage = props.result.percentage;
    if (percentage >= 90) return '🎉';
    if (percentage >= 70) return '😊';
    if (percentage >= 50) return '😐';
    return '😢';
  };

  const getMessage = () => {
    const percentage = props.result.percentage;
    if (percentage >= 90) return '¡Excelente trabajo!';
    if (percentage >= 70) return '¡Buen trabajo!';
    if (percentage >= 50) return 'No está mal';
    return '¡Sigue practicando!';
  };

  return (
    <Show when={props.show}>
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="glass-card p-8 max-w-md w-full animate-bounce-subtle">
          {/* Emoji and message */}
          <div class="text-center mb-6">
            <div class="text-8xl mb-4">{getEmoji()}</div>
            <h2 class="text-3xl font-bold text-white mb-2">{getMessage()}</h2>
          </div>

          {/* Statistics */}
          <div class="space-y-4 mb-8">
            {/* Main percentage */}
            <div class="text-center">
              <div class="text-6xl font-bold text-blue-300 mb-2">
                {props.result.percentage}%
              </div>
              <div class="text-white/70">respuestas correctas</div>
            </div>

            {/* Details */}
            <div class="grid grid-cols-3 gap-4 text-center">
              <div class="glass-button p-4">
                <div class="text-3xl font-bold text-green-400">
                  {props.result.correct}
                </div>
                <div class="text-xs text-white/60 mt-1">Correctas</div>
              </div>

              <div class="glass-button p-4">
                <div class="text-3xl font-bold text-red-400">
                  {props.result.incorrect}
                </div>
                <div class="text-xs text-white/60 mt-1">Incorrectas</div>
              </div>

              <div class="glass-button p-4">
                <div class="text-3xl font-bold text-blue-400">
                  {props.result.total}
                </div>
                <div class="text-xs text-white/60 mt-1">Total</div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div class="flex gap-4">
            <button
              onClick={props.onRepeat}
              class="flex-1 glass-button p-4 text-white font-semibold hover:scale-105 active:scale-95 transition-transform"
            >
              🔄 Repetir
            </button>
            <button
              onClick={props.onGoHome}
              class="flex-1 glass-button p-4 text-white font-semibold hover:scale-105 active:scale-95 transition-transform"
            >
              🏠 Inicio
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ScoreModal;

