interface ViewToggleProps {
  isCanonical: boolean;
  onToggle: (isCanonical: boolean) => void;
}

export function ViewToggle({ isCanonical, onToggle }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      <button
        onClick={() => onToggle(false)}
        className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
          !isCanonical
            ? 'bg-white text-navy-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        My View
      </button>
      <button
        onClick={() => onToggle(true)}
        className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
          isCanonical
            ? 'bg-white text-navy-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Standard View
      </button>
    </div>
  );
}
