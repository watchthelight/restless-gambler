import { dealInitial, hit, stand, doubleDown, canDouble, split, canSplit, settle } from '../../games/blackjack/engine.js';

export function dealInitialTask(bet: number): any {
    return dealInitial(bet);
}

export function hitTask(state: any): any {
    hit(state);
    return state;
}

export function standTask(state: any): any {
    stand(state);
    return state;
}

export function doubleDownTask(state: any): any {
    doubleDown(state);
    return state;
}

export function splitTask(state: any): any {
    split(state);
    return state;
}

export function settleTask(state: any): any {
    return settle(state);
}
