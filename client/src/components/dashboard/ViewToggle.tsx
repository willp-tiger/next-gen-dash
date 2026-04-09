interface ViewToggleProps {
  isCanonical: boolean;
  onToggle: (isCanonical: boolean) => void;
}

export function ViewToggle({ isCanonical, onToggle }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      <button
        onClick={() => onToggle(false)}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
          !isCanonical
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        My View
      </button>
      <button
        onClick={() => onToggle(true)}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
          isCanonical
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Standard View
      </button>
    </div>
  );
}
