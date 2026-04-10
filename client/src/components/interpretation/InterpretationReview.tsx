import { useState } from 'react';
import type { DashboardConfig, MetricConfig } from 'shared/types';

interface InterpretationReviewProps {
  config: DashboardConfig;
  onConfirm: (config: DashboardConfig) => void;
  onRetry: () => void;
}

export function InterpretationReview({
  config,
  onConfirm,
  onRetry,
}: InterpretationReviewProps) {
  const [editedConfig, setEditedConfig] = useState<DashboardConfig>(config);

  const updateMetric = (index: number, patch: Partial<MetricConfig>) => {
    setEditedConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) =>
        i === index ? { ...m, ...patch } : m
      ),
    }));
  };

  const updateThreshold = (
    index: number,
    band: 'green' | 'yellow',
    value: number
  ) => {
    setEditedConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) =>
        i === index
          ? {
              ...m,
              thresholds: {
                ...m.thresholds,
                [band]: { max: value },
              },
            }
          : m
      ),
    }));
  };

  const maxWeight = Math.max(
    ...editedConfig.interpretation.priorities.map((p) => p.weight),
    1
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Summary card */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Here&apos;s what I understood
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {editedConfig.interpretation.summary}
        </p>
      </div>

      {/* Priorities */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          Your Priorities
        </h3>
        <div className="space-y-3">
          {editedConfig.interpretation.priorities.map((priority, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {priority.label}
                </span>
                <span className="text-xs text-gray-400">
                  weight {priority.weight}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{
                    width: `${(priority.weight / maxWeight) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {priority.reasoning}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics grid */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          Your Dashboard Metrics
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editedConfig.metrics
            .filter((m) => m.visible)
            .map((metric, i) => {
              const realIndex = editedConfig.metrics.indexOf(metric);
              return (
                <div
                  key={metric.id}
                  className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
                >
                  {/* Metric name and chart type */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {metric.label}
                    </h4>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {metric.chartType}
                    </span>
                  </div>

                  {/* Thresholds */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <label className="text-xs text-gray-500">
                        Green max
                      </label>
                      <input
                        type="number"
                        value={metric.thresholds.green.max}
                        onChange={(e) =>
                          updateThreshold(
                            realIndex,
                            'green',
                            Number(e.target.value)
                          )
                        }
                        className="ml-auto w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <label className="text-xs text-gray-500">
                        Yellow max
                      </label>
                      <input
                        type="number"
                        value={metric.thresholds.yellow.max}
                        onChange={(e) =>
                          updateThreshold(
                            realIndex,
                            'yellow',
                            Number(e.target.value)
                          )
                        }
                        className="ml-auto w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      Direction: {metric.thresholds.direction}
                    </div>
                  </div>

                  {/* Reasoning */}
                  {metric.reasoning && (
                    <p className="mt-2 text-xs italic text-gray-400">
                      {metric.reasoning}
                    </p>
                  )}

                  {/* Size selector */}
                  <div className="mt-3 flex items-center gap-1">
                    <span className="mr-2 text-xs text-gray-500">Size:</span>
                    {(['sm', 'md', 'lg'] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => updateMetric(realIndex, { size })}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          metric.size === size
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {size.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={onRetry}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          Try Again
        </button>
        <button
          onClick={() => onConfirm(editedConfig)}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          Looks Good, Build My Dashboard
        </button>
      </div>
    </div>
  );
}
