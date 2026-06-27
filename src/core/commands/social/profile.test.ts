import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileCommand } from './profile.js';
import { xpService } from '../../services/xp/xpService.js';
import { repService } from '../../services/rep/repService.js';

vi.mock('../../services/xp/xpService.js', () => ({
  xpService: {
    getEntry: vi.fn(),
    getUserRank: vi.fn(),
    getMemberCount: vi.fn(),
    awardXp: vi.fn(),
  },
  xpForLevel: vi.fn((level: number) => (((level - 1) * level) / 2) * 100),
}));

vi.mock('../../services/rep/repService.js', () => ({
  repService: {
    getEntry: vi.fn(),
    getUserRank: vi.fn(),
    getMemberCount: vi.fn(),
  },
}));

describe('ProfileCommand', () => {
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
    await ProfileCommand.execute({ ...mockMessage, guildId: undefined }, []);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('server');
  });

  it('should show own profile when no user is specified', async () => {
    vi.mocked(xpService.getEntry).mockResolvedValue({
      guildId: 'guild-1',
      userId: 'user-1',
      platform: 'discord',
      xp: 250,
      level: 1,
      lastActionAt: Date.now(),
      updatedAt: Date.now(),
    });
    vi.mocked(xpService.getUserRank).mockResolvedValue(3);
    vi.mocked(xpService.getMemberCount).mockResolvedValue(20);
    vi.mocked(repService.getEntry).mockResolvedValue({
      guildId: 'guild-1',
      userId: 'user-1',
      platform: 'discord',
      rep: 8,
      updatedAt: Date.now(),
    });
    vi.mocked(repService.getUserRank).mockResolvedValue(5);

    await ProfileCommand.execute(mockMessage, []);

    expect(xpService.getEntry).toHaveBeenCalledWith('guild-1', 'user-1');
    expect(repService.getEntry).toHaveBeenCalledWith('guild-1', 'user-1');
    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0];
    expect(reply.embeds[0].title).toContain('TestUser');
    expect(reply.embeds[0].description).toContain('8');
  });

  it("should show another user's profile when a user ID is provided", async () => {
    mockMessage.fetchUser.mockResolvedValue({ username: 'OtherUser', avatarUrl: '' });
    vi.mocked(xpService.getEntry).mockResolvedValue({
      guildId: 'guild-1',
      userId: 'user-2',
      platform: 'discord',
      xp: 600,
      level: 3,
      lastActionAt: Date.now(),
      updatedAt: Date.now(),
    });
    vi.mocked(xpService.getUserRank).mockResolvedValue(1);
    vi.mocked(xpService.getMemberCount).mockResolvedValue(20);
    vi.mocked(repService.getEntry).mockResolvedValue({
      guildId: 'guild-1',
      userId: 'user-2',
      platform: 'discord',
      rep: 15,
      updatedAt: Date.now(),
    });
    vi.mocked(repService.getUserRank).mockResolvedValue(2);

    await ProfileCommand.execute(mockMessage, ['user-2']);

    expect(xpService.getEntry).toHaveBeenCalledWith('guild-1', 'user-2');
    expect(repService.getEntry).toHaveBeenCalledWith('guild-1', 'user-2');
    const reply = mockMessage.reply.mock.calls[0][0];
    expect(reply.embeds[0].title).toContain('OtherUser');
    expect(reply.embeds[0].description).toContain('15');
  });

  it('should display level 1 and 0 rep for new users', async () => {
    vi.mocked(xpService.getEntry).mockResolvedValue(null);
    vi.mocked(xpService.getUserRank).mockResolvedValue(null);
    vi.mocked(xpService.getMemberCount).mockResolvedValue(10);
    vi.mocked(repService.getEntry).mockResolvedValue(null);
    vi.mocked(repService.getUserRank).mockResolvedValue(null);

    await ProfileCommand.execute(mockMessage, []);

    const reply = mockMessage.reply.mock.calls[0][0];
    expect(reply.embeds[0].description).toContain('Level 1');
    expect(reply.embeds[0].description).toContain('0');
    expect(reply.embeds[0].color).toBe(0x999999);
  });
});
