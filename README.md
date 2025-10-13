## LET'S GO GAMBLING

To start:
`npm run launch`

## Performance Optimization (12-Thread CPU Cap)

This bot is optimized for high-performance operation on systems with a 12-thread CPU cap. The architecture splits work across multiple processes to maximize throughput while respecting thread limits.

### Architecture

- **Launcher Process**: Master process that spawns and manages worker processes
- **Compute Service**: Dedicated process running a worker thread pool (8 threads) for CPU-intensive game computations
- **I/O Workers**: 4 cluster processes handling Discord interactions and database I/O
- **Total Threads**: 4 (I/O) + 8 (compute) = 12 threads maximum

### Configuration

Concurrency settings are in `config/config.json`:

```json
{
  "concurrency": {
    "targetCpuThreads": 12,
    "clusterWorkers": 4,
    "workerPoolSize": 8,
    "shards": "auto",
    "sqlite": {
      "wal": true,
      "busyTimeoutMs": 5000,
      "cacheMB": 512,
      "mmapMB": 512
    }
  }
}
```

Override with environment variables:
- `RG_CPU_THREADS`: Target CPU threads
- `RG_CLUSTER_WORKERS`: Number of I/O worker processes
- `RG_WORKER_POOL_SIZE`: Worker threads in compute pool

### Running

- **Development**: `npm run dev:cluster`
- **Production**: `npm run start:cluster`
- **Benchmark**: `npm run bench`
- **Profile CPU**: `npm run profile:cpu`

### Tuning

- The system automatically clamps worker counts to stay within `targetCpuThreads`
- SQLite is tuned with WAL mode, increased cache/mmap sizes, and busy timeout
- UV_THREADPOOL_SIZE is set to `targetCpuThreads - 2` for optimal I/O performance
- Tests run with `--maxWorkers=12` for parallel execution
