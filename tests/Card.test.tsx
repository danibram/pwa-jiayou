import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import Card from '../src/components/Card';
import { HSKCharacter } from '../src/types';

describe('Card Component', () => {
    const mockCharacter: HSKCharacter = {
        character: '你',
        traditional: '你',
        pinyin: 'nǐ',
        definition: 'tú, usted',
        radical: '亻',
        stroke_count: 7,
        hsk_level: 1,
        general_standard: 1,
        frequency_rank: 5,
    };

    it('renders character on front face', () => {
        render(() => <Card character={mockCharacter} />);
        const characters = screen.getAllByText('你');
        expect(characters.length).toBeGreaterThan(0);
        expect(characters[0]).toBeInTheDocument();
    });

    it('shows pinyin and definition on back face when flipped', () => {
        render(() => <Card character={mockCharacter} flipped={true} />);
        expect(screen.getByText('nǐ')).toBeInTheDocument();
        expect(screen.getByText('tú, usted')).toBeInTheDocument();
    });

    it('shows stroke count when available', () => {
        render(() => <Card character={mockCharacter} flipped={true} />);
        expect(screen.getByText('7 trazos')).toBeInTheDocument();
    });

    it('calls onFlip callback when clicked', () => {
        const onFlip = vi.fn();
        const { container } = render(() => <Card character={mockCharacter} onFlip={onFlip} />);

        const cardElement = container.querySelector('.preserve-3d');
        if (cardElement) {
            fireEvent.click(cardElement);
            expect(onFlip).toHaveBeenCalledTimes(1);
        }
    });

    it('renders without stroke count when not provided', () => {
        const charWithoutStrokes: HSKCharacter = {
            character: '的',
            traditional: '的',
            pinyin: 'de',
            definition: 'partícula posesiva',
            radical: '白',
            stroke_count: 0,
            hsk_level: 1,
            general_standard: 1,
            frequency_rank: 1,
        };

        render(() => <Card character={charWithoutStrokes} flipped={true} />);
        expect(screen.queryByText(/trazos/)).not.toBeInTheDocument();
    });

    it('resets to front face when character changes', async () => {
        const firstChar: HSKCharacter = {
            character: '你',
            traditional: '你',
            pinyin: 'nǐ',
            definition: 'tú, usted',
            radical: '亻',
            stroke_count: 7,
            hsk_level: 1,
            general_standard: 1,
            frequency_rank: 5,
        };

        const secondChar: HSKCharacter = {
            character: '的',
            traditional: '的',
            pinyin: 'de',
            definition: 'partícula posesiva',
            radical: '白',
            stroke_count: 8,
            hsk_level: 1,
            general_standard: 1,
            frequency_rank: 1,
        };

        let currentChar = firstChar;
        const { container, unmount } = render(() => <Card character={currentChar} />);

        // Voltear la primera tarjeta
        const cardElement = container.querySelector('.preserve-3d');
        if (cardElement) {
            fireEvent.click(cardElement);
            // Verificar que está volteada (tiene la clase rotate-y-180)
            expect(cardElement.classList.contains('rotate-y-180')).toBe(true);
        }

        // Limpiar y re-renderizar con nuevo carácter
        unmount();
        currentChar = secondChar;
        const { container: newContainer } = render(() => <Card character={currentChar} />);

        // Verificar que la nueva tarjeta NO está volteada
        const newCardElement = newContainer.querySelector('.preserve-3d');
        if (newCardElement) {
            expect(newCardElement.classList.contains('rotate-y-180')).toBe(false);
        }
    });

    it('flips and unflips on consecutive clicks', () => {
        const { container } = render(() => <Card character={mockCharacter} />);
        const cardElement = container.querySelector('.preserve-3d');

        if (cardElement) {
            // Primera vez: no volteada
            expect(cardElement.classList.contains('rotate-y-180')).toBe(false);

            // Click 1: voltear
            fireEvent.click(cardElement);
            expect(cardElement.classList.contains('rotate-y-180')).toBe(true);

            // Click 2: devolver
            fireEvent.click(cardElement);
            expect(cardElement.classList.contains('rotate-y-180')).toBe(false);
        }
    });
});

