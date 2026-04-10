import { describe, it, expect, vi } from 'vitest';

// Test the JSON extraction logic used by the Claude service
// We extract this as a pure function test to avoid needing real API calls

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
}

describe('Claude Service - JSON Extraction', () => {
  it('extracts JSON from code fences with json tag', () => {
    const input = '```json\n{"summary": "test"}\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ summary: 'test' });
  });

  it('extracts JSON from code fences without json tag', () => {
    const input = '```\n{"summary": "test"}\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ summary: 'test' });
  });

  it('handles raw JSON without code fences', () => {
    const input = '{"summary": "test"}';
    expect(JSON.parse(extractJSON(input))).toEqual({ summary: 'test' });
  });

  it('handles JSON with surrounding whitespace', () => {
    const input = '  \n {"summary": "test"} \n  ';
    expect(JSON.parse(extractJSON(input))).toEqual({ summary: 'test' });
  });

  it('extracts from code fences with text before and after', () => {
    const input = 'Here is the config:\n```json\n{"summary": "test"}\n```\nHope this helps!';
    expect(JSON.parse(extractJSON(input))).toEqual({ summary: 'test' });
  });

  it('handles complex nested JSON in code fences', () => {
    const input = '```json\n{\n  "summary": "test",\n  "metrics": [\n    {"id": "total_revenue", "label": "Total Revenue"}\n  ]\n}\n```';
    const parsed = JSON.parse(extractJSON(input));
    expect(parsed.summary).toBe('test');
    expect(parsed.metrics).toHaveLength(1);
    expect(parsed.metrics[0].id).toBe('total_revenue');
  });
});

describe('Claude Service - Response Validation', () => {
  function validateInterpretResult(raw: string): boolean {
    try {
      const parsed = JSON.parse(extractJSON(raw));
      return !!(parsed.summary && Array.isArray(parsed.metrics) && parsed.metrics.length > 0);
    } catch {
      return false;
    }
  }

  it('validates a well-formed response', () => {
    const response = JSON.stringify({
      summary: 'Dashboard focused on revenue',
      priorities: [{ label: 'Revenue', weight: 0.9, reasoning: 'User mentioned it' }],
      metrics: [
        {
          id: 'total_revenue', label: 'Total Revenue', unit: 'dollars',
          chartType: 'line', size: 'lg',
          thresholds: { green: { max: 300000 }, yellow: { max: 200000 }, direction: 'higher-is-better' },
          position: 0, visible: true,
        },
      ],
      layout: { columns: 3, showCanonicalToggle: true },
    });
    expect(validateInterpretResult(response)).toBe(true);
  });

  it('rejects response with missing summary', () => {
    const response = JSON.stringify({
      metrics: [{ id: 'total_revenue' }],
    });
    expect(validateInterpretResult(response)).toBe(false);
  });

  it('rejects response with empty metrics array', () => {
    const response = JSON.stringify({
      summary: 'Test',
      metrics: [],
    });
    expect(validateInterpretResult(response)).toBe(false);
  });

  it('rejects response with no metrics field', () => {
    const response = JSON.stringify({
      summary: 'Test',
    });
    expect(validateInterpretResult(response)).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(validateInterpretResult('not json at all')).toBe(false);
  });

  it('rejects truncated JSON', () => {
    expect(validateInterpretResult('{"summary": "test", "metrics": [')).toBe(false);
  });
});
