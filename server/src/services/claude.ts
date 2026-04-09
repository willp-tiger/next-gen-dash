import Anthropic from '@anthropic-ai/sdk';
import type {
  MetricConfig,
  LayoutConfig,
  Priority,
} from '../../../shared/types.js';
import { INTERPRET_SYSTEM_PROMPT } from '../prompts/interpret.js';

const client = new Anthropic();

const MODEL = 'claude-sonnet-4-20250514';

interface InterpretResult {
  summary: string;
  priorities: Priority[];
  metrics: MetricConfig[];
  layout: LayoutConfig;
}

function extractJSON(text: string): string {
  // Try to extract JSON from code fences if Claude wraps it
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
}

export async function interpretPrompt(userInput: string): Promise<InterpretResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: INTERPRET_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userInput }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const raw = extractJSON(textBlock.text);

  try {
    const parsed = JSON.parse(raw) as InterpretResult;

    // Validate essential fields
    if (!parsed.summary || !Array.isArray(parsed.metrics) || parsed.metrics.length === 0) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (parseError) {
    // Fallback: return a sensible default
    console.error('Failed to parse Claude response:', parseError);
    console.error('Raw response:', raw);

    return {
      summary: 'Default dashboard based on your request.',
      priorities: [
        { label: 'General Monitoring', weight: 1, reasoning: 'Fallback configuration' },
      ],
      metrics: [
        {
          id: 'avg_wait_time', label: 'Avg Wait Time', unit: 'minutes',
          chartType: 'line', size: 'lg',
          thresholds: { green: { max: 3 }, yellow: { max: 5 }, direction: 'lower-is-better' },
          position: 0, visible: true,
        },
        {
          id: 'queue_depth', label: 'Queue Depth', unit: 'count',
          chartType: 'bar', size: 'md',
          thresholds: { green: { max: 10 }, yellow: { max: 20 }, direction: 'lower-is-better' },
          position: 1, visible: true,
        },
        {
          id: 'sla_compliance', label: 'SLA Compliance', unit: 'percent',
          chartType: 'gauge', size: 'md',
          thresholds: { green: { max: 95 }, yellow: { max: 80 }, direction: 'higher-is-better' },
          position: 2, visible: true,
        },
        {
          id: 'csat_score', label: 'CSAT Score', unit: 'score',
          chartType: 'gauge', size: 'md',
          thresholds: { green: { max: 4.5 }, yellow: { max: 3.5 }, direction: 'higher-is-better' },
          position: 3, visible: true,
        },
      ],
      layout: { columns: 3, showCanonicalToggle: true },
    };
  }
}

export async function generateRefinementSuggestion(
  systemPrompt: string,
  userContext: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContext }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const raw = extractJSON(textBlock.text);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error('Refinement suggestion generation failed');
    return null;
  }
}
