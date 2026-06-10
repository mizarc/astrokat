import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RollCommand } from './roll.js';

// Re-import parseDice by reaching into the module via dynamic eval
// We'll test the execute method directly since parseDice is not exported

describe('RollCommand', () => {
  let mockMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessage = {
      reply: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should roll a random d6 when given no arguments', async () => {
    await RollCommand.execute(mockMessage, []);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toMatch(/You rolled/);
    // Should NOT mention "sided" since it's the default d6
    expect(reply).not.toMatch(/sided/);
    // Should have a bold result between 1 and 6
    const totalMatch = reply.match(/\*\*(\d+)\*\*/);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]!, 10);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(6);
    }
  });

  it('should roll a custom die with a plain number argument', async () => {
    await RollCommand.execute(mockMessage, ['20']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toMatch(/on a/);
    // No critical hit/fail indicators on plain output
    expect(reply).not.toContain('⭐');
    expect(reply).not.toContain('💥');
    // Result should be between 1 and 20
    const totalMatch = reply.match(/\*\*(\d+)\*\*/);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]!, 10);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(20);
    }
  });

  it('should roll with D&D notation (e.g. 2d6)', async () => {
    await RollCommand.execute(mockMessage, ['2d6']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('2d6');
  });

  it('should roll with D&D notation including modifier (e.g. 2d20+6)', async () => {
    await RollCommand.execute(mockMessage, ['2d20+6']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('2d20');
    expect(reply).toContain('+');
    expect(reply).toContain('6');
  });

  it('should roll with D&D notation including negative modifier', async () => {
    await RollCommand.execute(mockMessage, ['2d8-3']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('2d8');
    expect(reply).toContain('-');
    expect(reply).toContain('3');
  });

  it('should roll a d8 with d notation', async () => {
    await RollCommand.execute(mockMessage, ['d8']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('d8');
  });

  it('should show critical hit indicator on max roll for a single die', async () => {
    // Mock Math.random to force a max roll
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(0.999); // forces roll = sides

    await RollCommand.execute(mockMessage, ['d20']);

    Math.random = originalRandom;

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('⭐');
  });

  it('should show critical fail indicator on minimum roll for a single die', async () => {
    // Mock Math.random to force a min roll (returns 0 → floor(0 * sides) + 1 = 1)
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(0.0);

    await RollCommand.execute(mockMessage, ['d20']);

    Math.random = originalRandom;

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('💥');
  });

  it('should reply with error on invalid format', async () => {
    await RollCommand.execute(mockMessage, ['invalid']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('❌');
  });

  it('should handle percentile dice (d%)', async () => {
    await RollCommand.execute(mockMessage, ['d%']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('d%');
  });

  it('should handle multiple dice with modifier', async () => {
    await RollCommand.execute(mockMessage, ['4d6+2']);

    expect(mockMessage.reply).toHaveBeenCalledOnce();
    const reply = mockMessage.reply.mock.calls[0][0] as string;
    expect(reply).toContain('🎲');
    expect(reply).toContain('4d6');
    expect(reply).toContain('+');
    expect(reply).toContain('2');
  });
});
