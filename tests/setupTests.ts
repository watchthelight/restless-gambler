// Reduce incidental info logging during Jest runs
import { isTestEnv } from '../src/util/env.js';
if (isTestEnv()) {
    const inf = console.info.bind(console);
    console.info = (...a: any[]) => { /* drop noisy boot/migrate infos */ };
}
