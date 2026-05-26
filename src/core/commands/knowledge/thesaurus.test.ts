import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getThesaurus } from './thesaurus.js';

describe('getThesaurus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch synonyms and antonyms for a valid word', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'happy',
          meanings: [
            {
              synonyms: ['joyful', 'cheerful', 'delighted'],
              antonyms: ['sad', 'unhappy'],
            },
            {
              synonyms: ['fortunate', 'lucky'],
              antonyms: [],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getThesaurus('happy');

    expect(result.word).toBe('happy');
    expect(result.formatted).toContain('Synonyms');
    expect(result.formatted).toContain('Antonyms');
    expect(result.formatted).toContain('joyful');
    expect(result.formatted).toContain('sad');
  });

  it('should handle words with no antonyms', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'test',
          meanings: [
            {
              synonyms: ['exam', 'trial'],
              antonyms: [],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getThesaurus('test');

    expect(result.formatted).toContain('Synonyms');
    expect(result.formatted).not.toContain('Antonyms');
  });

  it('should handle words with no synonyms or antonyms', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'xyz',
          meanings: [
            {
              synonyms: [],
              antonyms: [],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getThesaurus('xyz');

    expect(result.formatted).toBe('No synonyms or antonyms found.');
  });

  it('should throw error on failed API request', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(getThesaurus('invalidword')).rejects.toThrow(
      'Dictionary request failed: 404'
    );
  });

  it('should limit synonyms and antonyms to 10 items', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'big',
          meanings: [
            {
              synonyms: ['huge', 'large', 'giant', 'massive', 'enormous', 'vast', 'immense', 'colossal', 'titanic', 'whopping', 'ginormous', 'extra-large'],
              antonyms: ['small', 'tiny', 'little', 'miniature', 'petite', 'compact', 'diminutive', 'itsy-bitsy', 'wee', 'microscopic', 'nano'],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getThesaurus('big');

    const synMatch = result.formatted.match(/Synonyms: (.+)/);
    const synonyms = synMatch?.[1]?.split(', ') ?? [];
    expect(synonyms.length).toBeLessThanOrEqual(10);
  });
});
