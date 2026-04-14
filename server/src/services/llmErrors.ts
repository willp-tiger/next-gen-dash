// Classify Anthropic SDK errors so routes can return a structured 503 the
// client can surface as friendlier copy than the generic "something went wrong".

export type LLMErrorReason = 'billing' | 'auth' | 'rate_limit' | 'upstream';

export interface LLMErrorResponse {
  error: 'llm_unavailable';
  reason: LLMErrorReason;
  message: string;
}

interface AnthropicLikeError {
  status?: number;
  error?: { error?: { message?: string; type?: string } };
  message?: string;
}

export function classifyLLMError(err: unknown): LLMErrorResponse | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as AnthropicLikeError;
  const status = e.status;
  const inner = e.error?.error?.message || e.message || '';
  const lowered = inner.toLowerCase();

  if (typeof status !== 'number') return null;

  if (status === 400 && (lowered.includes('credit balance') || lowered.includes('billing'))) {
    return {
      error: 'llm_unavailable',
      reason: 'billing',
      message: 'The assistant is temporarily unavailable (account credits exhausted). Please try again later.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      error: 'llm_unavailable',
      reason: 'auth',
      message: 'The assistant is temporarily unavailable (authentication problem). Please try again later.',
    };
  }
  if (status === 429) {
    return {
      error: 'llm_unavailable',
      reason: 'rate_limit',
      message: 'The assistant is busy right now — please wait a moment and try again.',
    };
  }
  if (status >= 500 && status < 600) {
    return {
      error: 'llm_unavailable',
      reason: 'upstream',
      message: 'The assistant is temporarily unavailable. Please try again shortly.',
    };
  }
  return null;
}
