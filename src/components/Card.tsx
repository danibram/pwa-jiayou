import { Component, Show } from 'solid-js';
import { HSKCharacter } from '../types';

interface CardProps {
    character: HSKCharacter;
    flipped?: boolean;
    onFlip?: () => void;
}

const Card: Component<CardProps> = (props) => {
    return (
        <div
            class="relative w-72 h-80 md:w-80 md:h-96 cursor-pointer preserve-3d transition-transform duration-600"
            classList={{ 'rotate-y-180': props.flipped }}

            style={{ 'touch-action': 'pan-y' }}
        >
            {/* Front side - Character */}
            <div
                class="absolute inset-0 backface-hidden glass-card flex flex-col items-center justify-center p-6"
            >
                <div class="text-8xl md:text-9xl font-bold mb-2 text-white drop-shadow-2xl">
                    {props.character.character}
                    <Show when={props.character.traditional !== props.character.character}>
                        <span class="text-5xl md:text-6xl ml-3 text-white/70">
                            ({props.character.traditional})
                        </span>
                    </Show>
                </div>
            </div>

            {/* Back side - Translation */}
            <div
                class="absolute inset-0 backface-hidden rotate-y-180 glass-card flex flex-col items-center justify-center p-6"
            >
                <div class="text-5xl md:text-6xl font-bold mb-3 text-white">
                    {props.character.character}
                    <Show when={props.character.traditional !== props.character.character}>
                        <span class="text-3xl md:text-4xl ml-2 text-white/70">
                            ({props.character.traditional})
                        </span>
                    </Show>
                </div>
                <div class="text-2xl md:text-3xl text-blue-300 mb-3 font-medium">
                    {props.character.pinyin}
                </div>
                <div class="text-base md:text-xl text-white/90 text-center mb-3">
                    {props.character.definition}
                </div>
                <Show when={props.character.stroke_count}>
                    <div class="text-xs text-white/50">
                        {props.character.stroke_count} strokes
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default Card;

