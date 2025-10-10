import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach } from '@jest/globals';

const mockDb = {
  exec: jest.fn(),
  prepare: jest.fn().mockReturnValue({
    run: jest.fn(),
    get: jest.fn().mockReturnValue({ user_id: '123' })
  })
};

const mockLog = {
  error: jest.fn()
};

describe('admin add commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('runAdminAddNormal accepts real User option', async () => {
    const { runAdminAddNormal } = await import('../add.js');

    const mockInteraction = {
      options: {
        getUser: jest.fn().mockReturnValue({ id: '418156431112405030' })
      },
      user: { id: '697169405422862417' },
      guildId: '123456789',
      reply: jest.fn(() => Promise.resolve({} as any))
    } as any;

    const ctx = {
      guildDb: mockDb,
      log: mockLog
    };

    await runAdminAddNormal(mockInteraction, ctx);

    expect(mockInteraction.options.getUser).toHaveBeenCalledWith('user', true);
    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyCall = (mockInteraction.reply as jest.MockedFunction<any>).mock.calls[0][0];
    expect(replyCall).toHaveProperty('flags');
  });

  test('runAdminAddNormal prevents self-promotion', async () => {
    const { runAdminAddNormal } = await import('../add.js');

    const mockInteraction = {
      options: {
        getUser: jest.fn().mockReturnValue({ id: '697169405422862417' })
      },
      user: { id: '697169405422862417' },
      guildId: '123456789',
      reply: jest.fn(() => Promise.resolve({} as any))
    } as any;

    const ctx = {
      guildDb: mockDb,
      log: mockLog
    };

    await runAdminAddNormal(mockInteraction, ctx);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyCall = (mockInteraction.reply as jest.MockedFunction<any>).mock.calls[0][0];
    expect(replyCall.content).toContain("can't add yourself");
  });
});
