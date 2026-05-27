const TABS = [
  { id: 'home',    icon: '🏠', label: 'ホーム' },
  { id: 'shift',   icon: '📅', label: 'シフト' },
  { id: 'history', icon: '📜', label: '履歴' },
  { id: 'manual',  icon: '📖', label: 'マニュアル' },
]

export default function BottomNav({ tab, setTab, pendingCount }) {
  return (
    <nav className="flex-shrink-0 bg-white border-t border-gray-200">
      <div className="flex">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 flex flex-col items-center gap-0.5 ${tab === t.id ? 'text-line-green' : 'text-gray-400'}`}
          >
            <span className="text-xl relative">
              {t.icon}
              {t.id === 'home' && pendingCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span className="text-xs font-medium">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
