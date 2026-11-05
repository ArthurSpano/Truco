import { describe, expect, it } from 'vitest';
import { canCreate, canJoin, cleanCode, cleanName } from './homeForm.js';

describe('cleanCode', () => {
  it('upper-cases and trims', () => {
    expect(cleanCode(' bar7 ')).toBe('BAR7');
  });
  it('drops invalid characters and truncates to 4', () => {
    expect(cleanCode('http://x/?sala=ab-cd9')).toBe('ABCD');
  });
  it('extracts the code from a pasted URL', () => {
    expect(cleanCode('http://192.168.1.5:3000/?sala=BAR7')).toBe('BAR7');
    expect(cleanCode('http://192.168.1.5:3000/?code=bar7')).toBe('BAR7');
    expect(cleanCode('http://192.168.1.5:3000/#sala=bar7')).toBe('BAR7');
    expect(cleanCode('http://x/?a=1&sala=bar7&b=2')).toBe('BAR7');
    expect(cleanCode('?sala=%zz')).toBe('ZZ');
    expect(cleanCode('ab-cd9')).toBe('ABCD');
    expect(cleanCode('a0b1c')).toBe('ABC');
  });
  it('handles empty input', () => {
    expect(cleanCode('')).toBe('');
  });
});

describe('cleanName', () => {
  it('trims and collapses spaces', () => {
    expect(cleanName('  Zé   Carlos  ')).toBe('Zé Carlos');
  });
  it('cuts to 16 characters', () => {
    expect(cleanName('a'.repeat(30))).toHaveLength(16);
  });
});

describe('validation', () => {
  it('canCreate needs a name', () => {
    expect(canCreate('')).toBe(false);
    expect(canCreate('Ana')).toBe(true);
  });
  it('canJoin needs a name and a full code', () => {
    expect(canJoin('Ana', 'AB')).toBe(false);
    expect(canJoin('Ana', 'AB23')).toBe(true);
    expect(canJoin('', 'AB23')).toBe(false);
  });
});
