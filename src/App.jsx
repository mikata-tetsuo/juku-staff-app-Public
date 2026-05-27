import { useState, useEffect, useCallback } from 'react'
import { useLiff } from './hooks/useLiff'
import LoadingScreen from './components/LoadingScreen'
import ClockScreen from './components/ClockScreen'
import NoticeScreen from './components/NoticeScreen'
import BottomNav from './components/BottomNav'
import ManualScreen from './components/ManualScreen'
import HistoryScreen from './components/HistoryScreen'
import RegisterScreen from './components/RegisterScreen'
import { fetchItems } from './services/mockApi'

export default function App() {
  const { loading, lineProfile, staff, error } = useLiff()
  const [tab, setTab] = useState('home')
  const [items, setItems] = useState([])

  const loadItems = useCallback(() => {
    if (!staff) return
    fetchItems(staff.staffId).then(setItems).catch(() => {})
  }, [staff])

  useEffect(() => { loadItems() }, [loadItems])

  if (loading) {
    return <LoadingScreen message="LINEアカウントを確認中..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <p className="text-4xl">⚠️</p>
        <p className="text-gray-700 font-semibold text-center">エラーが発生しました</p>
        <p className="text-gray-400 text-sm text-center">{error}</p>
        <button onClick={() => location.reload()} className="px-6 py-2 bg-line-green text-white rounded-lg">
          再読み込み
        </button>
      </div>
    )
  }

  if (!staff) {
    return <RegisterScreen lineProfile={lineProfile} />
  }

  const pendingCount = items.filter(i => i.type === 'タスク' ? !i.completed : !i.confirmed).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        {tab === 'home' && (
          <ClockScreen
            staff={staff}
            lineProfile={lineProfile}
            items={items}
            onNoticeClick={() => setTab('notice')}
          />
        )}
        {tab === 'notice' && (
          <NoticeScreen
            staff={staff}
            items={items}
            setItems={setItems}
            onRefresh={loadItems}
          />
        )}
        {tab === 'shift'   && <ShiftTab />}
        {tab === 'history' && <HistoryScreen staff={staff} />}
        {tab === 'manual'  && <ManualScreen staff={staff} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} pendingCount={pendingCount} />
    </div>
  )
}

function ShiftTab() {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <h2 className="text-lg font-bold">📅 シフト</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-6 space-y-4">
          <p className="text-6xl">📅</p>
          <p className="font-semibold text-gray-700">シフト管理表を開く</p>
          <p className="text-sm text-gray-400">Googleスプレッドシートで確認できます</p>
          <a
            href="https://docs.google.com/spreadsheets/d/1WSjKGSSgKAAUyPqUXzSirjILeHKed7aaolHVL2qutR4/edit"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 px-8 py-4 bg-line-green text-white font-bold rounded-2xl shadow-md active:scale-95 transition-transform"
          >
            📊 シフト表を開く
          </a>
        </div>
      </div>
    </div>
  )
}
