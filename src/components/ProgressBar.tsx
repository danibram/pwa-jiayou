import { Component } from 'solid-js';

interface ProgressBarProps {
  current: number;
  total: number;
  correct?: number;
  incorrect?: number;
}

const ProgressBar: Component<ProgressBarProps> = (props) => {
  const percentage = () => (props.current / props.total) * 100;

  return (
    <div class="w-full max-w-md mx-auto">
      {/* Progress bar */}
      <div class="glass-card p-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm text-white/70">Progress</span>
          <span class="text-sm font-semibold text-white">
            {props.current} / {props.total}
          </span>
        </div>

        <div class="w-full h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 rounded-full"
            style={{ width: `${percentage()}%` }}
          />
        </div>

        {/* Training statistics */}
        {(props.correct !== undefined || props.incorrect !== undefined) && (
          <div class="flex justify-center gap-6 mt-4 text-sm">
            {props.correct !== undefined && (
              <div class="flex items-center gap-2">
                <span class="text-green-400 text-xl">✓</span>
                <span class="text-white font-semibold">{props.correct}</span>
              </div>
            )}
            {props.incorrect !== undefined && (
              <div class="flex items-center gap-2">
                <span class="text-red-400 text-xl">✗</span>
                <span class="text-white font-semibold">{props.incorrect}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;

