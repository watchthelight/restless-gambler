#!/usr/bin/env tsx

import { Client, GatewayIntentBits } from 'discord.js';
import { getConcurrency } from '../src/config/index.js';
import { createLogger } from '../src/log.js';
import { performance } from 'node:perf_hooks';

const log = createLogger();

interface BenchResult {
    operation: string;
    concurrency: number;
    totalRequests: number;
    durationMs: number;
    p50: number;
    p95: number;
    p99: number;
    rps: number;
    errors: number;
}

async function benchSlots(client: Client, concurrency: number): Promise<BenchResult> {
    const latencies: number[] = [];
    let errors = 0;
    const start = performance.now();

    // Simulate concurrent slot spins
    const promises = Array.from({ length: concurrency }, async (_, i) => {
        try {
            const startReq = performance.now();
            // Simulate slot spin computation
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            const latency = performance.now() - startReq;
            latencies.push(latency);
        } catch (err) {
            errors++;
        }
    });

    await Promise.all(promises);
    const duration = performance.now() - start;

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    return {
        operation: 'slots',
        concurrency,
        totalRequests: concurrency,
        durationMs: duration,
        p50,
        p95,
        p99,
        rps: (concurrency / duration) * 1000,
        errors,
    };
}

async function benchBlackjack(client: Client, concurrency: number): Promise<BenchResult> {
    const latencies: number[] = [];
    let errors = 0;
    const start = performance.now();

    // Simulate concurrent blackjack hands
    const promises = Array.from({ length: concurrency }, async (_, i) => {
        try {
            const startReq = performance.now();
            // Simulate blackjack hand evaluation
            await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
            const latency = performance.now() - startReq;
            latencies.push(latency);
        } catch (err) {
            errors++;
        }
    });

    await Promise.all(promises);
    const duration = performance.now() - start;

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    return {
        operation: 'blackjack',
        concurrency,
        totalRequests: concurrency,
        durationMs: duration,
        p50,
        p95,
        p99,
        rps: (concurrency / duration) * 1000,
        errors,
    };
}

async function benchWallet(client: Client, concurrency: number): Promise<BenchResult> {
    const latencies: number[] = [];
    let errors = 0;
    const start = performance.now();

    // Simulate concurrent wallet operations
    const promises = Array.from({ length: concurrency }, async (_, i) => {
        try {
            const startReq = performance.now();
            // Simulate wallet balance check
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            const latency = performance.now() - startReq;
            latencies.push(latency);
        } catch (err) {
            errors++;
        }
    });

    await Promise.all(promises);
    const duration = performance.now() - start;

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    return {
        operation: 'wallet',
        concurrency,
        totalRequests: concurrency,
        durationMs: duration,
        p50,
        p95,
        p99,
        rps: (concurrency / duration) * 1000,
        errors,
    };
}

function printResult(result: BenchResult): void {
    console.log(`\n${result.operation.toUpperCase()} Benchmark:`);
    console.log(`  Concurrency: ${result.concurrency}`);
    console.log(`  Total Requests: ${result.totalRequests}`);
    console.log(`  Duration: ${result.durationMs.toFixed(2)}ms`);
    console.log(`  P50 Latency: ${result.p50.toFixed(2)}ms`);
    console.log(`  P95 Latency: ${result.p95.toFixed(2)}ms`);
    console.log(`  P99 Latency: ${result.p99.toFixed(2)}ms`);
    console.log(`  RPS: ${result.rps.toFixed(2)}`);
    console.log(`  Errors: ${result.errors}`);
}

async function main(): Promise<void> {
    const config = getConcurrency();
    console.log(`Benchmarking with concurrency config:`, config);

    // Create mock client for testing
    const client = new Client({
        intents: [GatewayIntentBits.Guilds],
    });

    const concurrencyLevels = [1, 10, 50, 100, 500];

    for (const concurrency of concurrencyLevels) {
        console.log(`\n=== Testing with ${concurrency} concurrent requests ===`);

        const slotsResult = await benchSlots(client, concurrency);
        printResult(slotsResult);

        const blackjackResult = await benchBlackjack(client, concurrency);
        printResult(blackjackResult);

        const walletResult = await benchWallet(client, concurrency);
        printResult(walletResult);
    }

    console.log('\nBenchmark complete!');
}

if (require.main === module) {
    main().catch((err) => {
        log.error({ msg: 'bench_error', error: String(err) });
        process.exit(1);
    });
}
