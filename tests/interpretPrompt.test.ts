import { describe, it, expect } from 'vitest';
import { buildInterpretPrompt } from '../server/src/prompts/interpret.js';

// These tests verify the static structure of the prompt scaffold. The metric-ID list
// is injected at runtime from getMetricDefs() (DB-backed), so we don't assert on metric IDs here.

describe('Interpretation System Prompt', () => {
  it('is a non-empty string', () => {
    const prompt = buildInterpretPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('instructs Claude to return JSON', () => {
    expect(buildInterpretPrompt().toLowerCase()).toContain('json');
  });

  it('mentions chart types', () => {
    const prompt = buildInterpretPrompt();
    expect(prompt).toContain('number');
    expect(prompt).toContain('line');
    expect(prompt).toContain('bar');
    expect(prompt).toContain('gauge');
  });

  it('mentions thresholds', () => {
    expect(buildInterpretPrompt().toLowerCase()).toContain('threshold');
  });

  it('specifies metric count guidance (4-8)', () => {
    expect(buildInterpretPrompt()).toMatch(/4.?8/);
  });

  it('mentions the supply chain domain', () => {
    expect(buildInterpretPrompt().toLowerCase()).toContain('supply chain');
  });
});
