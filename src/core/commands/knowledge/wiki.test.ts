import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UnifiedMessage } from '../../types.js';
import { WikiCommand } from './wiki.js';

const createMessage = (): UnifiedMessage => ({
  id: '123',
  content: '',
  author: { id: 'user-1', username: 'tester' },
  channel: { id: 'channel-1' },
  platform: 'fluxer',
  reply: vi.fn().mockResolvedValue(undefined),
  edit: vi.fn().mockResolvedValue(undefined),
});

describe('WikiCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ask for a search term when no arguments are provided', async () => {
    const message = createMessage();

    await WikiCommand.execute(message, []);

    expect(message.reply).toHaveBeenCalledWith('Please provide a search term.');
  });

  it('should fetch and reply with a Wikipedia summary on valid response', async () => {
    const message = createMessage();
    const mockResponse = {
      ok: true,
      json: async () => ({
        title: 'Space Cat',
        description: 'A fictional animal',
        extract: 'Space Cat is a playful fictional creature that explores the cosmos.',
        thumbnail: { source: 'https://example.com/cat.jpg' },
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Space_Cat' } },
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await WikiCommand.execute(message, ['space', 'cat']);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://en.wikipedia.org/api/rest_v1/page/summary/space%20cat',
    );
    expect(message.reply).toHaveBeenCalledWith(
      [
        '## 📖 Space Cat',
        'Space Cat is a playful fictional creature that explores the cosmos.',
        '',
        '🔗 <https://en.wikipedia.org/wiki/Space_Cat>',
      ].join('\n'),
    );
  });

  it('should reply with an error message when the Wikipedia API response is not ok', async () => {
    const message = createMessage();
    const mockResponse = {
      ok: false,
      status: 404,
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await WikiCommand.execute(message, ['missing', 'page']);

    expect(message.reply).toHaveBeenCalledWith(
      'An error occurred while fetching the Wikipedia article.',
    );
  });

  it('should reply with an error message when the fetch call throws', async () => {
    const message = createMessage();
    global.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

    await WikiCommand.execute(message, ['network', 'fail']);

    expect(message.reply).toHaveBeenCalledWith(
      'An error occurred while fetching the Wikipedia article.',
    );
  });
});
