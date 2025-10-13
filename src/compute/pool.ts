import Piscina from 'piscina';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConcurrency, validateConcurrency } from '../config/index.js';
import { createLogger } from '../log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger();

export interface ComputeRequest {
    op: string;
    args: any[];
    timeoutMs?: number;
}

export interface ComputeResponse {
    result: any;
    error?: string;
}

export class ComputePool {
    private pool?: any;
    private initialized = false;

    async init(): Promise<void> {
        if (this.initialized) return;

        const config = validateConcurrency(getConcurrency());

        // Guard against multiple pools
        if ((globalThis as any).__computePool) {
            throw new Error('Compute pool already exists - only one pool allowed per process');
        }
        (globalThis as any).__computePool = this;

        this.pool = new (Piscina as any)({
            filename: path.join(__dirname, 'worker.js'),
            maxThreads: config.workerPoolSize,
            minThreads: Math.min(2, config.workerPoolSize),
            idleTimeout: 30000,
            resourceLimits: {
                maxOldGenerationSizeMb: 512,
                maxYoungGenerationSizeMb: 128,
            },
        });

        this.initialized = true;
        log.info({ msg: 'compute_pool_initialized', maxThreads: config.workerPoolSize });
    }

    async run(request: ComputeRequest): Promise<any> {
        if (!this.pool) {
            throw new Error('Compute pool not initialized');
        }

        const timeoutMs = request.timeoutMs || 30000;

        try {
            const result = await this.pool.run(request, { timeout: timeoutMs });
            return result;
        } catch (error: any) {
            log.error({ msg: 'compute_task_error', op: request.op, error: String(error?.message || error) });
            throw error;
        }
    }

    async destroy(): Promise<void> {
        if (this.pool) {
            await this.pool.destroy();
            this.pool = undefined;
            this.initialized = false;
            (globalThis as any).__computePool = undefined;
            log.info({ msg: 'compute_pool_destroyed' });
        }
    }

    getStats(): any {
        return this.pool?.stats || {};
    }
}

// Global singleton
let poolInstance: ComputePool | null = null;

export function getComputePool(): ComputePool {
    if (!poolInstance) {
        poolInstance = new ComputePool();
    }
    return poolInstance;
}

export async function initComputePool(): Promise<void> {
    const pool = getComputePool();
    await pool.init();
}

export async function destroyComputePool(): Promise<void> {
    if (poolInstance) {
        await poolInstance.destroy();
        poolInstance = null;
    }
}

// RPC interface for IPC
export async function handleComputeRequest(request: ComputeRequest): Promise<ComputeResponse> {
    try {
        const pool = getComputePool();
        const result = await pool.run(request);
        return { result };
    } catch (error: any) {
        return { result: null, error: String(error?.message || error) };
    }
}
