import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { ui } from './ui.js';

type Data = any;

const logsDir = path.resolve('logs');
try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}

const stream = pino.destination({ dest: path.join(logsDir, 'app.ndjson'), mkdir: true, sync: false });
const level = process.env.LOG_LEVEL || 'info';
const logger = pino({ level, base: undefined }, stream);

function info(msg: string, scope?: string, data?: Data) {
  if (process.env.QUIET !== '1' && !process.argv.includes('--quiet')) ui.say(msg, 'info');
  logger.info({ msg, ts: Date.now(), scope, data });
}
function warn(msg: string, scope?: string, data?: Data) {
  ui.say(msg, 'warn');
  logger.warn({ msg, ts: Date.now(), scope, data });
}
function error(msg: string, scope?: string, data?: Data) {
  ui.say(msg, 'error');
  logger.error({ msg, ts: Date.now(), scope, data });
}
function debug(msg: string, scope?: string, data?: Data) {
  if (level === 'debug') ui.say(msg, 'dim');
  logger.debug({ msg, ts: Date.now(), scope, data });
}

function withScope(scope: string) {
  return {
    info: (msg: string, data?: Data) => info(msg, scope, data),
    warn: (msg: string, data?: Data) => warn(msg, scope, data),
    error: (msg: string, data?: Data) => error(msg, scope, data),
    debug: (msg: string, data?: Data) => debug(msg, scope, data),
  };
}

export const log = { info, warn, error, debug, withScope };
export default log;

