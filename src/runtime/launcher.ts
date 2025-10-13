import { fork, ChildProcess } from 'node:child_process';
import { createServer, Server } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConcurrency, validateConcurrency } from '../config/index.js';
import { createLogger } from '../log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger();

interface WorkerInfo {
    process: ChildProcess;
    role: 'compute' | 'io';
    id: number;
    ipcPort?: number;
}

export class Launcher {
    private workers: WorkerInfo[] = [];
    private computeService?: WorkerInfo;
    private ipcServer?: Server;
    private shuttingDown = false;

    async start(): Promise<void> {
        const config = validateConcurrency(getConcurrency());

        log.info({
            msg: 'launcher_start',
            targetCpuThreads: config.targetCpuThreads,
            clusterWorkers: config.clusterWorkers,
            workerPoolSize: config.workerPoolSize,
        });

        console.log(`resolved: clusterWorkers=${config.clusterWorkers}, workerPoolSize=${config.workerPoolSize}, targetCpuThreads=${config.targetCpuThreads}`);

        // Set UV_THREADPOOL_SIZE
        const uvPoolSize = Math.max(4, Math.min(12, config.targetCpuThreads - 2));
        process.env.UV_THREADPOOL_SIZE = String(uvPoolSize);
        log.info({ msg: 'uv_threadpool_set', size: uvPoolSize });

        // Start IPC server for compute service
        this.ipcServer = createServer();
        await new Promise<void>((resolve) => {
            this.ipcServer!.listen(0, '127.0.0.1', () => resolve());
        });
        const ipcPort = (this.ipcServer.address() as any).port;

        // Start compute service
        await this.startComputeService(ipcPort);

        // Start I/O workers
        for (let i = 0; i < config.clusterWorkers; i++) {
            await this.startIOWorker(i, ipcPort);
        }

        // Health checks
        this.startHealthChecks();

        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    }

    private async startComputeService(ipcPort: number): Promise<void> {
        const worker: WorkerInfo = {
            process: fork(path.join(__dirname, '../index.js'), [], {
                env: { ...process.env, ROLE: 'compute', IPC_PORT: String(ipcPort) },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            }),
            role: 'compute',
            id: 0,
            ipcPort,
        };

        this.computeService = worker;
        this.workers.push(worker);

        worker.process.on('exit', (code) => {
            log.error({ msg: 'compute_service_exited', code });
            if (!this.shuttingDown) {
                this.restartWorker(worker);
            }
        });

        worker.process.on('message', (msg: any) => {
            if (msg?.type === 'ready') {
                log.info({ msg: 'compute_service_ready' });
            }
        });

        // Wait for ready signal
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Compute service startup timeout')), 30000);
            worker.process.on('message', (msg: any) => {
                if (msg?.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
    }

    private async startIOWorker(id: number, ipcPort: number): Promise<void> {
        const worker: WorkerInfo = {
            process: fork(path.join(__dirname, '../index.js'), [], {
                env: { ...process.env, ROLE: 'io', WORKER_ID: String(id), IPC_PORT: String(ipcPort) },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            }),
            role: 'io',
            id,
            ipcPort,
        };

        this.workers.push(worker);

        worker.process.on('exit', (code) => {
            log.error({ msg: 'io_worker_exited', workerId: id, code });
            if (!this.shuttingDown) {
                this.restartWorker(worker);
            }
        });

        worker.process.on('message', (msg: any) => {
            if (msg?.type === 'ready') {
                log.info({ msg: 'io_worker_ready', workerId: id });
            }
        });

        // Wait for ready signal
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`IO worker ${id} startup timeout`)), 30000);
            worker.process.on('message', (msg: any) => {
                if (msg?.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
    }

    private restartWorker(worker: WorkerInfo): void {
        log.info({ msg: 'restarting_worker', role: worker.role, id: worker.id });
        const index = this.workers.indexOf(worker);
        if (index !== -1) {
            this.workers.splice(index, 1);
        }

        setTimeout(() => {
            if (worker.role === 'compute') {
                this.startComputeService(worker.ipcPort!);
            } else {
                this.startIOWorker(worker.id, worker.ipcPort!);
            }
        }, 5000);
    }

    private startHealthChecks(): void {
        setInterval(() => {
            for (const worker of this.workers) {
                if (!worker.process.connected) {
                    log.warn({ msg: 'worker_disconnected', role: worker.role, id: worker.id });
                }
            }
        }, 30000);
    }

    private async shutdown(signal: string): Promise<void> {
        if (this.shuttingDown) return;
        this.shuttingDown = true;

        log.info({ msg: 'launcher_shutdown_start', signal });

        // Shutdown workers
        for (const worker of this.workers) {
            worker.process.kill('SIGTERM');
        }

        // Wait for workers to exit
        await Promise.all(
            this.workers.map(worker =>
                new Promise<void>((resolve) => {
                    worker.process.on('exit', () => resolve());
                })
            )
        );

        // Close IPC server
        if (this.ipcServer) {
            this.ipcServer.close();
        }

        log.info({ msg: 'launcher_shutdown_complete' });
        process.exit(0);
    }
}

// Main entry point
if (require.main === module) {
    const launcher = new Launcher();
    launcher.start().catch((err) => {
        log.error({ msg: 'launcher_error', error: String(err) });
        process.exit(1);
    });
}
