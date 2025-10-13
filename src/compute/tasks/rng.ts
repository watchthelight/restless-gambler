import { RNG, cryptoRNG, mulberry32 } from '../../util/rng.js';
import { withUserLuck } from '../../rng/luck.js';

export function generateRandomNumbers(count: number, seed?: number): number[] {
    const rng: RNG = seed !== undefined ? mulberry32(seed) : cryptoRNG;
    const numbers: number[] = [];
    for (let i = 0; i < count; i++) {
        numbers.push(rng(1000000) / 1000000); // 0..1
    }
    return numbers;
}

export function shuffleArray<T>(array: T[], seed?: number): T[] {
    const rng: RNG = seed !== undefined ? mulberry32(seed) : cryptoRNG;
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = rng(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function applyLuckToRNG(guildId: string, userId: string, count: number): number[] {
    const numbers: number[] = [];
    for (let i = 0; i < count; i++) {
        numbers.push(withUserLuck(guildId, userId, () => Math.random()));
    }
    return numbers;
}
