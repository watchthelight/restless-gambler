export function isTestEnv() {
    // JEST_WORKER_ID is set by Jest; also honor NODE_ENV=test
    return !!(process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test");
}
export function isCi() {
    return !!process.env.CI;
}
