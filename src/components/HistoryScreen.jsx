import { useState, useEffect } from 'react'
import { fetchWorkHistory, fetchPayrollHistory, fetchCurrentPayroll } from '../services/mockApi'

function WorkHistory({ staffId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchWorkHistory(staffId)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [staffId])

  if (loading) return <p className="text-gray-400 text-sm text-center p-8">読み込み中...</p>
  if (error)   return <p className="text-red-400 text-sm text-center p-8">読み込みに失敗しました</p>
  if (!data?.records?.length) return <p className="text-gray-400 text-sm text-center p-8">勤務記録がありません</p>

  return (
    <>
      {data.records.map((r, i) => (
        <div key={i} className="mx-4 my-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-gray-800">{r.date}</span>
            <span className="text-sm text-gray-500">{r.clockIn} 〜 {r.clockOut}</span>
          </div>
          <p className="text-sm text-gray-600">{r.lessons}</p>
          <p className="text-xs text-right text-line-green font-semibold mt-1">勤務合計 {r.total}</p>
        </div>
      ))}
    </>
  )
}

function PayHistory({ staffId }) {
  const [current, setCurrent] = useState(undefined)
  const [records, setRecords] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([fetchPayrollHistory(staffId), fetchCurrentPayroll(staffId)])
      .then(([hist, cur]) => {
        setRecords(hist.records || [])
        setCurrent(cur)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [staffId])

  if (loading) return <p className="text-gray-400 text-sm text-center p-8">読み込み中...</p>
  if (error)   return <p className="text-red-400 text-sm text-center p-8">読み込みに失敗しました</p>
  if (!current && !records?.length) return <p className="text-gray-400 text-sm text-center p-8">給与履歴がありません</p>

  return (
    <>
      {current && (
        <div className="mx-4 my-3 bg-yellow-50 border-2 border-yellow-300 rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold text-gray-800">📊 今月のお給料（途中）</span>
            <span className="text-[10px] font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full">途中</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{current.asOf}までの集計</p>
          <div className="space-y-1 text-sm text-gray-600">
            {!!current.lesson    && <div className="flex justify-between"><span>授業料</span><span>{current.lesson.toLocaleString()}円</span></div>}
            {!!current.transport && <div className="flex justify-between"><span>交通費</span><span>{current.transport.toLocaleString()}円</span></div>}
            {!!current.chief     && <div className="flex justify-between"><span>チーフ手当</span><span>{current.chief.toLocaleString()}円</span></div>}
          </div>
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-yellow-200">
            <span className="font-bold text-gray-700">ここまでの合計</span>
            <span className="font-bold text-yellow-700 text-lg">{(current.total || 0).toLocaleString()}円</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-500">出勤数</span>
            <span className="text-xs text-gray-500">{current.days || 0}日</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">〆日は{current.period.end}です。</p>
        </div>
      )}

      {records?.length === 0 && (
        <p className="text-gray-400 text-sm text-center p-8">確定済みの給与履歴がありません</p>
      )}
      {records?.map((r, i) => (
        <div key={i} className="mx-4 my-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-gray-800">{r.start} 〜 {r.end}</span>
            <span className="text-xs text-gray-400">出勤 {r.days}日</span>
          </div>
          <div className="space-y-1 text-sm text-gray-600">
            {!!r.lesson    && <div className="flex justify-between"><span>授業料</span><span>{r.lesson.toLocaleString()}円</span></div>}
            {!!r.transport && <div className="flex justify-between"><span>交通費</span><span>{r.transport.toLocaleString()}円</span></div>}
            {!!r.chief     && <div className="flex justify-between"><span>チーフ手当</span><span>{r.chief.toLocaleString()}円</span></div>}
          </div>
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
            <span className="font-bold text-gray-700">合計支給額</span>
            <span className="font-bold text-line-green text-lg">{r.total.toLocaleString()}円</span>
          </div>
        </div>
      ))}
    </>
  )
}

export default function HistoryScreen({ staff }) {
  const [subtab, setSubtab] = useState('work')

  const activeBtn  = 'flex-1 py-2 text-sm font-semibold text-line-green border-b-2 border-line-green'
  const inactiveBtn = 'flex-1 py-2 text-sm font-semibold text-gray-400 border-b-2 border-transparent'

  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <h2 className="text-lg font-bold">📋 履歴</h2>
      </div>

      <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
        <button onClick={() => setSubtab('work')} className={subtab === 'work' ? activeBtn : inactiveBtn}>
          勤務記録
        </button>
        <button onClick={() => setSubtab('pay')} className={subtab === 'pay' ? activeBtn : inactiveBtn}>
          給与履歴
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {subtab === 'work' && <WorkHistory staffId={staff.staffId} />}
        {subtab === 'pay'  && <PayHistory  staffId={staff.staffId} />}
      </div>
    </div>
  )
}
