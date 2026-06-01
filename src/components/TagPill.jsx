export default function TagPill({ tag, active, onClick, onRemove }) {
  if (onRemove) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#143109]/10
               text-[#143109] rounded text-xs">
        {tag}
        <button
          type="button"
          onClick={() => onRemove(tag)}
          className="hover:text-red-500 transition-colors leading-none"
        >
          ×
        </button>
      </span>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(tag)}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          active
            ? 'bg-[#143109] text-white'
            : 'bg-[#143109]/10 text-[#143109] hover:bg-[#143109]/20'
        }`}
      >
        {tag}
      </button>
    )
  }

  return (
    <span className="px-2 py-0.5 bg-[#143109]/10 text-[#143109] rounded text-xs">
      {tag}
    </span>
  )
}