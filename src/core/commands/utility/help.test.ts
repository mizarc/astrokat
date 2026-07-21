import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BotCommand } from '../../types.js';

vi.mock('../../router.js', () => ({
  getCommands: () =>
    new Map<string, BotCommand>([
      [
        'ping',
        {
          name: 'ping',
          description: 'Replies with Pong!',
          category: 'utility',
          execute: vi.fn(),
        },
      ],
      [
        'role',
        {
          name: 'role',
          description: 'Role management',
          category: 'administration',
          execute: vi.fn(),
        },
      ],
      [
        'coinflip',
        {
          name: 'coinflip',
          description: 'Flips a coin',
          category: 'social',
          execute: vi.fn(),
        },
      ],
      [
        'define',
        {
          name: 'define',
          description: 'Fetches definitions',
          category: 'knowledge',
          execute: vi.fn(),
        },
      ],
      [
        'remindme',
        {
          name: 'remindme',
          description: 'Sets a reminder',
          category: 'utility',
          execute: vi.fn(),
        },
      ],
      [
        'system',
        {
          name: 'system',
          description: 'System administration',
          category: 'operation',
          execute: vi.fn(),
        },
      ],
      [
        'purge',
        {
          name: 'purge',
          description: 'Bulk delete messages',
          category: 'moderation',
          execute: vi.fn(),
        },
      ],
    ]),
}));

import { HelpCommand } from './help.js';

describe('HelpCommand', () => {
  let mockMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessage = {
      reply: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should reply with the help embed', async () => {
    await HelpCommand.execute(mockMessage, []);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as any;
    expect(reply.embeds).toHaveLength(1);
    expect(reply.embeds[0].title).toContain('📋');
  });

  it('should list all categories', async () => {
    await HelpCommand.execute(mockMessage, []);

    const reply = mockMessage.reply.mock.calls[0][0] as any;
    const desc = reply.embeds[0].description;
    expect(desc).toContain('**🔐 Administration**');
    expect(desc).toContain('**📚 Knowledge**');
    expect(desc).toContain('**🛡️ Moderation**');
    expect(desc).toContain('**🎮 Social**');
    expect(desc).toContain('**🛠️ Operation**');
    expect(desc).toContain('**🔧 Utility**');
  });

  it('should list all command names and descriptions', async () => {
    await HelpCommand.execute(mockMessage, []);

    const reply = mockMessage.reply.mock.calls[0][0] as any;
    const desc = reply.embeds[0].description;
    expect(desc).toContain('role');
    expect(desc).toContain('define');
    expect(desc).toContain('coinflip');
    expect(desc).toContain('system');
    expect(desc).toContain('purge');
    expect(desc).toContain('ping');
    expect(desc).toContain('remindme');
  });
});
