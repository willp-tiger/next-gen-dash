export function SkeletonTile({ variant = 'number' }: { variant?: 'number' | 'chart' | 'gauge' }) {
  return (
    <div className="animate-pulse metric-card p-5">
      <div className="pl-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <div className="h-8 w-20 rounded bg-slate-200" />
          <div className="h-4 w-10 rounded bg-slate-100" />
        </div>

        <div className="mt-2 h-4 w-16 rounded bg-slate-100" />

        {variant === 'chart' && (
          <div className="mt-3 h-[160px] rounded-lg bg-slate-100" />
        )}
        {variant === 'gauge' && (
          <div className="mt-3 flex justify-center">
            <div className="h-[70px] w-[120px] rounded-t-full bg-slate-100" />
          </div>
        )}
        {variant === 'number' && (
          <div className="mt-3 h-12 rounded-lg bg-slate-100" />
        )}
      </div>
    </div>
  );
}

export function SkeletonGrid({ columns = 3, count = 6 }: { columns?: number; count?: number }) {
  const variants: Array<'number' | 'chart' | 'gauge'> = [];
  for (let i = 0; i < count; i++) {
    variants.push(i % 3 === 0 ? 'chart' : i % 3 === 1 ? 'number' : 'gauge');
  }

  return (
    <div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-${columns} lg:grid-cols-${columns}`}>
      {variants.map((v, i) => (
        <SkeletonTile key={i} variant={v} />
      ))}
    </div>
  );
}
