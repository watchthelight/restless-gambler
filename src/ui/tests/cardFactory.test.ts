import { Themes } from '../theme.js';
import { generateCard } from '../cardFactory.js';

describe('card factory', () => {
  test('generates a buffer for notice', async () => {
    const { buffer } = await generateCard({ layout: 'Notice', theme: Themes.midnight, payload: { title: 'Test', message: 'Hello world' } });
    expect(Buffer.isBuffer(buffer)).toBeTruthy();
    expect(buffer.length).toBeGreaterThan(10);
  });
});
