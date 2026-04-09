import { describe, it, expect } from 'vitest';
import { INTERPRET_SYSTEM_PROMPT } from '../server/src/prompts/interpret.js';
import { AVAILABLE_METRICS } from '../shared/types.js';

describe('Interpretation System Prompt', () => {
  it('is a non-empty string', () => {
    expect(typeof INTERPRET_SYSTEM_PROMPT).toBe('string');
    expect(INTERPRET_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions all 12 available metric IDs', () => {
    for (const id of AVAILABLE_METRICS) {
      expect(INTERPRET_SYSTEM_PROMPT).toContain(id);
    }
  });

  it('instructs Claude to return JSON', () => {
    const lowerPrompt = INTERPRET_SYSTEM_PROMPT.toLowerCase();
    expect(lowerPrompt).toContain('json');
  });

  it('mentions chart types', () => {
    const prompt = INTERPRET_SYSTEM_PROMPT;
    expect(prompt).toContain('number');
    expect(prompt).toContain('line');
    expect(prompt).toContain('bar');
  });

  it('mentions thresholds', () => {
    expect(INTERPRET_SYSTEM_PROMPT.toLowerCase()).toContain('threshold');
  });

  it('specifies metric count guidance (4-8)', () => {
    expect(INTERPRET_SYSTEM_PROMPT).toMatch(/4.?8/);
  });
});
