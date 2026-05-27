import { useState, useEffect, useCallback } from 'react'
import { fetchManual } from '../services/mockApi'
import RateTableScreen from './RateTableScreen'
import ShortcutGuideScreen from './ShortcutGuideScreen'

export default function ManualScreen({ staff }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [internalScreen, setInternalScreen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await fetchManual(staff.staffId)
      setItems(data.items || [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [staff.staffId])

  useEffect(() => { load() }, [load])

  if (internalScreen === 'rate-table') {
    return <RateTableScreen staff={staff} onBack={() => setInternalScreen(null)} />
  }
  if (internalScreen === 'shortcut-guide') {
    return <ShortcutGuideScreen onBack={() => setInternalScreen(null)} />
  }

  // カテゴリ順にグループ化（出現順を維持）
  const groups = []
  const groupMap = {}
  items.forEach(item => {
    if (!groupMap[item.category]) {
      groupMap[item.category] = []
      groups.push({ category: item.category, items: groupMap[item.category] })
    }
    groupMap[item.category].push(item)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">📖 マニュアル</h2>
            <p className="text-xs opacity-75">タップで Google Drive を開きます</p>
          </div>
          <button onClick={load} className="text-2xl active:opacity-50 px-2" title="最新に更新">🔄</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {loading && <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>}
        {error && <p className="text-red-400 text-sm text-center py-8">読み込み失敗</p>}
        {!loading && !error && groups.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">マニュアルが登録されていません</p>
        )}
        {!loading && !error && groups.map(g => (
          <div key={g.category}>
            <p className="text-xs font-bold text-gray-500 mb-2">{g.category || '（その他）'}</p>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {g.items.map((item, i) => {
                if (item.url?.startsWith('internal:')) {
                  const target = item.url.slice('internal:'.length)
                  return (
                    <button key={i} onClick={() => setInternalScreen(target)}
                      className="w-full text-left p-4 active:bg-gray-50 flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{item.title}</p>
                        {item.desc && <p className="text-xs text-gray-500 mt-1">{item.desc}</p>}
                      </div>
                      <span className="text-gray-400 ml-2 flex-shrink-0">›</span>
                    </button>
                  )
                }
                if (item.url) {
                  return (
                    <a key={i} href={item.url} target="_blank" rel="noreferrer"
                      className="block p-4 active:bg-gray-50 flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{item.title}</p>
                        {item.desc && <p className="text-xs text-gray-500 mt-1">{item.desc}</p>}
                      </div>
                      <span className="text-gray-400 ml-2 flex-shrink-0">›</span>
                    </a>
                  )
                }
                return (
                  <div key={i} className="p-4 flex justify-between items-center opacity-60">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{item.title}</p>
                      <p className="text-xs text-amber-600 mt-1">📝 準備中</p>
                    </div>
                    <span className="text-gray-300 ml-2 flex-shrink-0">🔒</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
