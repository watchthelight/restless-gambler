import pino from "pino";

const NO_EMOJI = true;

export function createLogger() {
    const transport = pino.transport ? pino.transport({
        target: "pino-pretty",
        options: {
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            colorize: false,
            ignore: "pid,hostname",
        },
    }) : undefined;
    return pino({
        base: undefined,
        level: process.env.LOG_LEVEL || "info",
        formatters: {
            level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.epochTime,
    }, transport as any);
}
