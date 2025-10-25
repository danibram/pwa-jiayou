import { Component, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { HSKCharacter } from '../types';
import { SwipeHandlers, useSwipeDetector } from '../utils/swipeDetection';
import Card from './Card';

interface SwipeableCardProps {
    character: HSKCharacter;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    showSwipeIndicators?: boolean;
    onFlip?: () => void;
}

const SwipeableCard: Component<SwipeableCardProps> = (props) => {
    const [swipeDirection, setSwipeDirection] = createSignal<'left' | 'right' | null>(null);
    const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = createSignal(false);
    const [hadMovement, setHadMovement] = createSignal(false);
    const [isFlipped, setIsFlipped] = createSignal(false);
    let cardRef: HTMLDivElement | undefined;
    let rootRef: HTMLDivElement | undefined;

    // Reset flip when character changes
    createEffect(() => {
        props.character.character;
        setIsFlipped(false);
    });

    const handleRootClick = () => {
        // Only flip if there was NO recent movement
        if (!hadMovement()) {
            setIsFlipped(!isFlipped());
            props.onFlip?.();
        }
    };

    const handlers: SwipeHandlers = {
        onSwipeLeft: () => {
            setSwipeDirection('left');
            setTimeout(() => {
                props.onSwipeLeft?.();
                setSwipeDirection(null);
            }, 200);
        },
        onSwipeRight: () => {
            setSwipeDirection('right');
            setTimeout(() => {
                props.onSwipeRight?.();
                setSwipeDirection(null);
            }, 200);
        },
        onDrag: (deltaX: number, deltaY: number) => {
            setIsDragging(true);
            setDragOffset({ x: deltaX, y: deltaY });
            // Mark that there was movement
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                setHadMovement(true);
            }
        },
        onDragEnd: () => {
            setIsDragging(false);
            setDragOffset({ x: 0, y: 0 });
            // Reset after a brief delay
            setTimeout(() => setHadMovement(false), 500);
        },
    };

    const swipeDetector = useSwipeDetector(handlers);

    onMount(() => {
        if (cardRef) {
            swipeDetector(cardRef);
        }
    });

    onCleanup(() => {
        swipeDetector(null);
    });

    const getCardTransform = () => {
        const offset = dragOffset();
        if (!isDragging() || (offset.x === 0 && offset.y === 0)) {
            return 'translate(0px, 0px) rotate(0deg)';
        }

        // Calculate rotation based on horizontal displacement
        const rotation = (offset.x / 20) * 1.5; // Maximum ~15 degrees
        const clampedRotation = Math.max(-15, Math.min(15, rotation));

        return `translate(${offset.x}px, ${offset.y * 0.3}px) rotate(${clampedRotation}deg)`;
    };

    const getCardOpacity = () => {
        const offset = dragOffset();
        const distance = Math.abs(offset.x);
        if (distance === 0) return 1;

        // Gradually reduce opacity when dragging
        return Math.max(0.7, 1 - distance / 400);
    };

    return (
        <div
            ref={rootRef}
            class="relative cursor-pointer"
            style={{ 'touch-action': 'pan-y' }}
            onClick={handleRootClick}
        >
            {/* Swipe indicators */}
            {props.showSwipeIndicators && (
                <>
                    {/* Left arrow */}
                    <div
                        class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-20 text-4xl transition-all duration-200"
                        classList={{
                            'opacity-0': swipeDirection() !== 'right' && dragOffset().x <= 0,
                            'opacity-100 animate-slide-in-right': swipeDirection() === 'right',
                        }}
                        style={{ opacity: dragOffset().x > 30 ? Math.min(1, dragOffset().x / 100) : undefined }}
                    >
                        ⬅️
                    </div>

                    {/* Right arrow */}
                    <div
                        class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-20 text-4xl transition-all duration-200"
                        classList={{
                            'opacity-0': swipeDirection() !== 'left' && dragOffset().x >= 0,
                            'opacity-100 animate-slide-in-left': swipeDirection() === 'left',
                        }}
                        style={{ opacity: dragOffset().x < -30 ? Math.min(1, Math.abs(dragOffset().x) / 100) : undefined }}
                    >
                        ➡️
                    </div>
                </>
            )}

            {/* Card */}
            <div
                ref={cardRef}
                class="transition-all"
                classList={{
                    'duration-200': !isDragging(),
                    'duration-0': isDragging(),
                    'scale-95': swipeDirection() !== null && !isDragging(),
                }}
                style={{
                    transform: getCardTransform(),
                    opacity: getCardOpacity(),
                }}
            >
                <Card character={props.character} flipped={isFlipped()} />
            </div>
        </div>
    );
};

export default SwipeableCard;

