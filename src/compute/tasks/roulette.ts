import { spinWheel, resolveBets } from '../../games/roulette/engine.js';

export function spinWheelTask(): number {
    return spinWheel();
}

export function resolveBetsTask(outcome: number, bets: any[]): any {
    return resolveBets(outcome, bets);
}
