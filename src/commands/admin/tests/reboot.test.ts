import { EventEmitter } from 'events';

describe('admin reboot', () => {
  test('perform reboot runs REBOOT_CMD or exits', async () => {
    jest.isolateModules(async () => {
      process.env.REBOOT_CMD = 'echo reboot';
      const execSpy = jest.spyOn(require('child_process'), 'execFile').mockImplementation(((file: string, args?: any, cb?: any) => {
        const callback = typeof args === 'function' ? args : cb;
        if (callback) callback(null, '', '');
        return {} as any;
      }) as any);
      const { handleButton } = require('../index');
      const client = new EventEmitter() as any;
      client.destroy = jest.fn().mockResolvedValue(undefined);

      const interaction = {
        customId: `admin:reboot:confirm:697169405422862417:${Date.now()}`,
        user: { id: '697169405422862417' },
        guildId: null,
        reply: jest.fn().mockResolvedValue(undefined),
        deferred: false,
        replied: false,
        client,
      } as any;
      // Mock requireAdmin to no-op permit
      jest.spyOn(require('../../../admin/roles'), 'requireAdmin').mockResolvedValue(undefined as any);

      await handleButton(interaction);
      expect(execSpy).toHaveBeenCalled();
    });
  });
});
