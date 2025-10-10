import { jest } from '@jest/globals';

jest.doMock('../../../admin/roles.js', () => ({
  requireAdmin: jest.fn().mockImplementation(() => { })
}));

const mockSpawn = jest.fn().mockReturnValue({
  unref: jest.fn()
});

jest.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

const mockExit = jest.fn();

describe('admin reboot', () => {
  beforeAll(() => {
    Object.defineProperty(process, 'exit', {
      value: mockExit,
      writable: true
    });
  });

  test('perform reboot does not exit in tests', async () => {
    process.env.NODE_ENV = "test";
    process.env.JEST_WORKER_ID = "1";
    const mod = await import('../index.js');
    await mod.performReboot();  // should NOT call process.exit in tests
    expect(mockExit).not.toHaveBeenCalled();
    // In test env, spawn should not be called
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
