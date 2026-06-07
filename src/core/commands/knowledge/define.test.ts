import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDictionary } from './define.js';

describe('getDictionary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch definitions for a valid word', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'hello',
          phonetic: '/həˈloʊ/',
          meanings: [
            {
              partOfSpeech: 'interjection',
              definitions: [
                {
                  definition: 'Used as a greeting.',
                  example: 'Hello, how are you?',
                },
              ],
            },
            {
              partOfSpeech: 'noun',
              definitions: [
                {
                  definition: 'An utterance of "hello".',
                  example: 'She gave a warm hello.',
                },
              ],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getDictionary('hello');

    expect(result.word).toBe('hello');
    expect(result.formatted).toContain('/həˈloʊ/');
    expect(result.formatted).toContain('interjection');
    expect(result.formatted).toContain('Used as a greeting.');
    expect(result.formatted).toContain('Hello, how are you?');
    expect(result.formatted).toContain('noun');
  });

  it('should handle word without phonetic', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'test',
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [
                {
                  definition: 'A procedure for evaluating something.',
                },
              ],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getDictionary('test');

    expect(result.word).toBe('test');
    expect(result.formatted).toContain('**noun**');
    expect(result.formatted).toContain('A procedure for evaluating something.');
  });

  it('should limit definitions to 3 per part of speech', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'run',
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [
                { definition: 'Definition 1' },
                { definition: 'Definition 2' },
                { definition: 'Definition 3' },
                { definition: 'Definition 4' },
                { definition: 'Definition 5' },
              ],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getDictionary('run');

    expect(result.formatted).toContain('Definition 1');
    expect(result.formatted).toContain('Definition 3');
    expect(result.formatted).not.toContain('Definition 4');
    expect(result.formatted).not.toContain('Definition 5');
  });

  it('should throw error on failed API request', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(getDictionary('invalidword')).rejects.toThrow(
      'Dictionary request failed: 404'
    );
  });

  it('should handle multiple meanings with examples', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [
        {
          word: 'light',
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [
                {
                  definition: 'The natural agent that stimulates sight.',
                  example: 'The light was too bright.',
                },
              ],
            },
            {
              partOfSpeech: 'adjective',
              definitions: [
                {
                  definition: 'Of little weight.',
                  example: 'The box was very light.',
                },
              ],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getDictionary('light');

    expect(result.formatted).toContain('noun');
    expect(result.formatted).toContain('adjective');
    expect(result.formatted).toContain('The natural agent');
    expect(result.formatted).toContain('The light was too bright');
    expect(result.formatted).toContain('The box was very light');
  });
});
