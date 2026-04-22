import { useState, useEffect, useCallback } from 'react';
import type { RefinementSuggestion } from 'shared/types';
import { getRefinementSuggestions, updateSuggestion } from '../../api/client';

interface RefinementBannerProps {
  userId: string;
  onAccept: (suggestion: RefinementSuggestion) => void;
}

export function RefinementBanner({ userId, onAccept }: RefinementBannerProps) {
  const [suggestion, setSuggestion] = useState<RefinementSuggestion | null>(
    null
  );
  const [dismissed, setDismissed] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    try {
      const suggestions = await getRefinementSuggestions(userId);
      const pending = suggestions.find((s) => s.status === 'pending');
      if (pending && pending.id !== suggestion?.id) {
        setSuggestion(pending);
        setDismissed(false);
      }
    } catch {
      // silently ignore polling errors
    }
  }, [userId, suggestion?.id]);

  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  const suggestionExtra = suggestion
    ? { userId: suggestion.userId, type: suggestion.type, metricId: suggestion.metricId }
    : undefined;

  const handleAccept = async () => {
    if (!suggestion) return;
    try {
      await updateSuggestion(suggestion.id, 'accepted', suggestionExtra);
      onAccept(suggestion);
      setSuggestion(null);
    } catch {
      // ignore
    }
  };

  const handleDismiss = async () => {
    if (!suggestion) return;
    try {
      await updateSuggestion(suggestion.id, 'dismissed', suggestionExtra);
      setDismissed(true);
    } catch {
      // ignore
    }
  };

  if (!suggestion || dismissed) return null;

  return (
    <div className="animate-slide-in mb-4 overflow-hidden rounded-xl bg-indigo-50 ring-1 ring-indigo-200">
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Lightbulb icon */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-4 w-4 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </div>

        <p className="flex-1 text-sm text-indigo-900">{suggestion.reason}</p>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleAccept}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
          >
            Yes, add it
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
