import { spin } from '../../games/slots/engine.js';

export function spinTask(bet: number): any {
    return spin(bet);
}
