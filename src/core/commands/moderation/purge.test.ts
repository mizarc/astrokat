import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedMessage, ChannelMessage } from '../../types.js';

// Mock i18n before importing the command
vi.mock('../../i18n.js', () => ({
  t: (key: string, params?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      'commands.purge.notAvailable': '❌ Cannot purge messages in this channel.',
      'commands.purge.botMissingPerms': '❌ I need the **Manage Messages** permission to purge.',
      'commands.purge.invalidAmount': '❌ Please provide a valid number of messages to purge (1-100).',
      'commands.purge.tooMany': '❌ You can only purge up to **100** messages at a time.',
      'commands.purge.noMessages': '❌ No messages found to purge.',
      'commands.purge.success': '✅ Purged **{count}** messages.',
      'commands.purge.successUser': '✅ Purged **{count}** messages from that user.',
      'commands.purge.skippedOldUser': '\n⚠️ {count} message(s) skipped (older than 14 days).',
      'commands.purge.error': '❌ Failed to purge messages: {detail}',
    };

    let value = map[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  },
}));

// Import after mocking
const { PurgeCommand } = await import('./purge.js');

describe('PurgeCommand', () => {
  let mockCanManageMessages: ReturnType<typeof vi.fn>;
  let mockBulkDelete: ReturnType<typeof vi.fn>;
  let mockReply: ReturnType<typeof vi.fn>;

  function makeMessages(count: number, options?: { targetId?: string; old?: boolean }): ChannelMessage[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i + 1}`,
      authorId: options?.targetId ?? 'user-abc',
      createdAt: options?.old
        ? new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 - i * 1000)
        : new Date(Date.now() - i * 1000),
    }));
  }

  function createMessage(overrides?: Record<string, any>): UnifiedMessage {
    const msg = {
      id: 'cmd-msg',
      content: 'purge',
      author: { id: 'user-abc', username: 'TestUser' },
      channel: makeChannel(),
      platform: 'discord' as const,
      reply: mockReply,
      edit: vi.fn(),
      ...overrides,
    };
    return msg as unknown as UnifiedMessage;
  }

  function makeChannel(overrides?: Record<string, any>) {
    const fetchMessages: (limit: number) => Promise<ChannelMessage[]> = vi.fn();
    const bulkDelete: (messageIds: string[]) => Promise<void> = mockBulkDelete as any;
    const canManageMessages: () => Promise<boolean> = mockCanManageMessages as any;
    return {
      id: 'channel-123',
      canManageMessages,
      fetchMessages,
      bulkDelete,
      ...overrides,
    } as unknown as UnifiedMessage['channel'];
  }

  beforeEach(() => {
    mockReply = vi.fn();
    mockCanManageMessages = vi.fn().mockResolvedValue(true);
    mockBulkDelete = vi.fn().mockResolvedValue(undefined);
  });

  it('should reject when platform has no channel methods', async () => {
    const msg = createMessage({
      channel: { id: 'channel-123' },
    });
    await PurgeCommand.execute(msg, ['5']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Cannot purge'));
  });

  it('should reject when bot lacks ManageMessages', async () => {
    mockCanManageMessages.mockResolvedValue(false);
    const msg = createMessage();
    await PurgeCommand.execute(msg, ['5']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Manage Messages'));
  });

  it('should reject a non-positive amount', async () => {
    const msg = createMessage();
    await PurgeCommand.execute(msg, ['0']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('valid number'));
  });

  it('should reject an amount over 100', async () => {
    const msg = createMessage();
    await PurgeCommand.execute(msg, ['150']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('only purge up to'));
  });

  it('should reject when amount is not a number', async () => {
    const msg = createMessage();
    await PurgeCommand.execute(msg, ['abc']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('valid number'));
  });

  it('should purge messages successfully', async () => {
    const fetchMessages = vi.fn().mockResolvedValue(makeMessages(5));
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['5']);

    expect(fetchMessages).toHaveBeenCalledWith(6);
    expect(mockBulkDelete).toHaveBeenCalledWith(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Purged'));
  });

  it('should exclude the command message from bulkDelete', async () => {
    const fetchMessages = vi.fn().mockResolvedValue([
      { id: 'cmd-msg', authorId: 'user-abc', createdAt: new Date() },
      ...makeMessages(4),
    ]);
    const msg = createMessage({ id: 'cmd-msg', channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['5']);

    // cmd-msg should NOT be in the delete list
    expect(mockBulkDelete).toHaveBeenCalledWith(
      expect.not.arrayContaining(['cmd-msg']),
    );
  });

  it('should filter by target user when provided', async () => {
    const messages: ChannelMessage[] = [
      { id: 'm01', authorId: 'user-abc', createdAt: new Date() },
      { id: 'm02', authorId: 'user-abc', createdAt: new Date() },
      { id: 'm03', authorId: 'user-abc', createdAt: new Date() },
      { id: 'm04', authorId: 'user-xyz', createdAt: new Date() },
      { id: 'm05', authorId: 'user-xyz', createdAt: new Date() },
    ];
    const fetchMessages = vi.fn().mockResolvedValue(messages);
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['5', '<@user-xyz>']);

    // Only user-xyz's messages
    expect(mockBulkDelete).toHaveBeenCalledWith(['m04', 'm05']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Purged'));
  });

  it('should report no messages when empty', async () => {
    const fetchMessages = vi.fn().mockResolvedValue([]);
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['5']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('No messages'));
    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('should handle bulkDelete errors', async () => {
    const fetchMessages = vi.fn().mockResolvedValue(makeMessages(3));
    mockBulkDelete.mockRejectedValue(new Error('Something went wrong'));
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['3']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Failed to purge'));
  });

  it('should handle 403 errors as missing permissions', async () => {
    const fetchMessages = vi.fn().mockResolvedValue(makeMessages(3));
    mockBulkDelete.mockRejectedValue(new Error('403: Missing Permissions'));
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['3']);
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Manage Messages'));
  });

  it('should report skipped old messages with user filter', async () => {
    // Mix of fresh and old messages for the target user
    const messages: ChannelMessage[] = [
      ...makeMessages(3, { targetId: 'user-abc' }),                  // fresh
      ...makeMessages(2, { targetId: 'user-abc', old: true }),        // old (>14 days)
    ];
    const fetchMessages = vi.fn().mockResolvedValue(messages);
    const msg = createMessage({ channel: makeChannel({ fetchMessages, bulkDelete: mockBulkDelete }) });

    await PurgeCommand.execute(msg, ['5', 'user-abc']);

    // Should report skipped old messages
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
    );
  });
});
