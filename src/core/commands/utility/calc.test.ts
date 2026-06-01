import { describe, it, expect } from 'vitest';
import { calculate } from './calc.js';

describe('calculate', () => {
  it('should evaluate addition', () => {
    const result = calculate('2 + 2');
    expect(result.result).toBe(4);
  });

  it('should evaluate subtraction', () => {
    const result = calculate('10 - 3');
    expect(result.result).toBe(7);
  });

  it('should evaluate multiplication', () => {
    const result = calculate('4 * 5');
    expect(result.result).toBe(20);
  });

  it('should evaluate division', () => {
    const result = calculate('20 / 4');
    expect(result.result).toBe(5);
  });

  it('should respect order of operations', () => {
    const result = calculate('2 + 3 * 4');
    expect(result.result).toBe(14);
  });

  it('should handle parentheses', () => {
    const result = calculate('(2 + 3) * 4');
    expect(result.result).toBe(20);
  });

  it('should evaluate exponentiation', () => {
    const result = calculate('2^3');
    expect(result.result).toBe(8);
  });

  it('should handle decimal numbers', () => {
    const result = calculate('3.5 + 2.5');
    expect(result.result).toBe(6);
  });

  it('should round long decimals to 6 places', () => {
    const result = calculate('1 / 3');
    expect(result.result).toBeCloseTo(0.333333, 6);
  });

  it('should format the result string correctly', () => {
    const result = calculate('5 + 7');
    expect(result.formatted).toBe('5 + 7 = 12');
  });

  it('should throw on invalid expression', () => {
    expect(() => calculate('invalid')).toThrow();
  });

  it('should return Infinity on division by zero', () => {
    const result = calculate('1 / 0');
    expect(result.result).toBe(Infinity);
  });
});
