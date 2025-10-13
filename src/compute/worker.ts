import { parentPort } from 'node:worker_threads';
import { ComputeRequest } from './pool.js';

// Import task handlers
import * as rngTasks from '../compute/tasks/rng.js';
import * as blackjackTasks from '../compute/tasks/blackjack.js';
import * as slotsTasks from '../compute/tasks/slots.js';
import * as rouletteTasks from '../compute/tasks/roulette.js';

const taskHandlers: Record<string, (...args: any[]) => any> = {
    // RNG tasks
    'rng.generate': (...args: any[]) => rngTasks.generateRandomNumbers(args[0], args[1]),
    'rng.shuffle': (...args: any[]) => rngTasks.shuffleArray(args[0]),
    'rng.withLuck': (...args: any[]) => rngTasks.applyLuckToRNG(args[0], args[1], args[2]),

    // Blackjack tasks
    'blackjack.deal': (...args: any[]) => blackjackTasks.dealInitialTask(args[0]),
    'blackjack.hit': (...args: any[]) => blackjackTasks.hitTask(args[0]),
    'blackjack.stand': (...args: any[]) => blackjackTasks.standTask(args[0]),
    'blackjack.double': (...args: any[]) => blackjackTasks.doubleDownTask(args[0]),
    'blackjack.split': (...args: any[]) => blackjackTasks.splitTask(args[0]),
    'blackjack.settle': (...args: any[]) => blackjackTasks.settleTask(args[0]),

    // Slots tasks
    'slots.spin': (...args: any[]) => slotsTasks.spinTask(args[0]),

    // Roulette tasks
    'roulette.spin': (...args: any[]) => rouletteTasks.spinWheelTask(),
    'roulette.resolve': (...args: any[]) => rouletteTasks.resolveBetsTask(args[0], args[1]),
};

async function handleRequest(request: ComputeRequest): Promise<any> {
    const handler = taskHandlers[request.op];
    if (!handler) {
        throw new Error(`Unknown compute operation: ${request.op}`);
    }

    return handler(request.args);
}

if (parentPort) {
    parentPort.on('message', async (request: ComputeRequest) => {
        try {
            const result = await handleRequest(request);
            parentPort!.postMessage(result);
        } catch (error: any) {
            parentPort!.postMessage({ error: String(error?.message || error) });
        }
    });
}
