import { updateItemStatus } from '../services/mockApi'

export default function NoticeScreen({ staff, items, setItems, onRefresh }) {
  const pending = items.filter(i => i.type === 'タスク' ? !i.completed : !i.confirmed).length

  function toggleItem(itemId, field) {
    const updated = items.map(i => {
      if (i.itemId !== itemId) return i
      const next = { ...i, [field]: !i[field] }
      if (field === 'completed' && next.completed) next.confirmed = true
      return next
    })
    setItems(updated)
    const item = updated.find(i => i.itemId === itemId)
    updateItemStatus(staff.staffId, itemId, field, item[field]).catch(() => {})
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">📋 お知らせ</h2>
            <p className="text-xs opacity-75">確認したら左、完了したら右にチェック</p>
          </div>
          <button onClick={onRefresh} className="text-2xl active:opacity-50 leading-none mt-1 px-2">🔄</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded border-2 border-blue-500 bg-blue-500" />
                確認
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded border-2 border-line-green bg-line-green" />
                完了
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {pending > 0 ? `残り ${pending} 件` : 'すべて完了 🎉'}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">現在お知らせはありません</p>
          ) : (
            items.map(item => (
              <ItemRow key={item.itemId} item={item} onToggle={toggleItem} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item, onToggle }) {
  const isTask = item.type === 'タスク'
  const isDone = isTask ? item.completed : item.confirmed

  return (
    <div className={`py-3 border-b border-gray-100 last:border-0 flex items-start gap-2 ${isDone ? 'opacity-50' : ''}`}>
      <button
        onClick={() => onToggle(item.itemId, 'confirmed')}
        className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold
          ${item.confirmed ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 bg-white'}`}
      >
        {item.confirmed ? '✓' : ''}
      </button>

      {isTask ? (
        <button
          onClick={() => onToggle(item.itemId, 'completed')}
          className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold
            ${item.completed ? 'bg-line-green border-line-green text-white' : 'border-gray-300 bg-white'}`}
        >
          {item.completed ? '✓' : ''}
        </button>
      ) : (
        <div className="flex-shrink-0 mt-0.5 w-6 h-6" />
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`}>
          {item.text}
          {item.date && <span className="text-xs text-gray-400 ml-1">{item.date}</span>}
        </p>
        {item.dueDate && <p className="text-[11px] text-gray-400 mt-0.5">〆切: {item.dueDate}</p>}
      </div>
    </div>
  )
}
