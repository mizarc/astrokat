import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeaderboardCommand } from './leaderboard.js';
import { xpService } from '../../services/xp/xpService.js';

vi.mock('../../services/xp/xpService.js', () => ({
  xpService: {
    getLeaderboard: vi.fn(),
  },
}));

describe('LeaderboardCommand', () => {
  let mockMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessage = {
      guildId: 'guild-1',
      author: { id: 'user-1', username: 'TestUser' },
      reply: vi.fn().mockResolvedValue(undefined),
      fetchUser: vi.fn(),
    };
  });

  it('should reject usage outside a guild', async () => {
    await LeaderboardCommand.execute({ ...mockMessage, guildId: undefined }, []);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('server');
  });

  it('should show a message when no XP data exists', async () => {
    vi.mocked(xpService.getLeaderboard).mockResolvedValue([]);

    await LeaderboardCommand.execute(mockMessage, []);

    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('XP');
  });

  it('should display top entries with medals', async () => {
    vi.mocked(xpService.getLeaderboard).mockResolvedValue([
      { guildId: 'guild-1', userId: 'user-a', platform: 'discord' as const, xp: 1000, level: 4, lastActionAt: 0, updatedAt: 0 },
      { guildId: 'guild-1', userId: 'user-b', platform: 'discord' as const, xp: 500, level: 3, lastActionAt: 0, updatedAt: 0 },
      { guildId: 'guild-1', userId: 'user-c', platform: 'discord' as const, xp: 200, level: 1, lastActionAt: 0, updatedAt: 0 },
    ]);

    mockMessage.fetchUser
      .mockResolvedValueOnce({ username: 'UserA', avatarUrl: '' })
      .mockResolvedValueOnce({ username: 'UserB', avatarUrl: '' })
      .mockResolvedValueOnce({ username: 'UserC', avatarUrl: '' });

    await LeaderboardCommand.execute(mockMessage, []);

    const reply = mockMessage.reply.mock.calls[0][0];
    expect(reply.embeds[0].title).toBeDefined();
    const desc = reply.embeds[0].description as string;
    expect(desc).toContain('UserA');
    expect(desc).toContain('UserB');
    expect(desc).toContain('UserC');
  });
});
