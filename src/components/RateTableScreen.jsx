import { useState, useEffect } from 'react'
import { fetchRateTable } from '../services/mockApi'

export default function RateTableScreen({ staff, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchRateTable(staff.staffId)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [staff.staffId])

  const headers = data?.headers || []
  const myGrade = String(data?.myGrade || '').trim()
  const myColIdx = myGrade ? headers.findIndex((h, i) => i > 0 && String(h).trim() === myGrade) : -1
  const isMM = label => /^MM/.test(label)
  const mmRows   = (data?.rows || []).filter(r => isMM(r.label))
  const hourRows = (data?.rows || []).filter(r => !isMM(r.label))

  function renderSection(title, rows, firstColLabel) {
    if (rows.length === 0) return null
    return (
      <div className="mb-5">
        <p className="text-sm font-bold text-gray-700 mb-2">{title}</p>
        <div className="overflow-auto border border-gray-200 rounded-lg">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {headers.map((h, i) => {
                  const isFirst = i === 0
                  const isMy = i === myColIdx
                  const cls = isFirst
                    ? 'sticky left-0 top-0 bg-gray-700 text-white z-20 px-2 py-2 font-bold whitespace-nowrap text-left'
                    : isMy
                      ? 'sticky top-0 bg-line-green text-white z-10 px-2 py-2 font-bold whitespace-nowrap text-center min-w-[56px]'
                      : 'sticky top-0 bg-gray-200 text-gray-700 z-10 px-2 py-2 font-bold whitespace-nowrap text-center min-w-[56px]'
                  return <th key={i} className={cls}>{isFirst ? firstColLabel : h}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                  <th className="sticky left-0 bg-gray-100 z-10 px-2 py-1.5 font-bold whitespace-nowrap text-left">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => {
                    const isMy = (i + 1) === myColIdx
                    const fmt = v == null || v === '' ? '' : Number(v).toLocaleString()
                    return (
                      <td key={i} className={`px-2 py-1.5 text-right whitespace-nowrap ${isMy ? 'bg-green-100 font-bold text-green-700' : ''}`}>
                        {fmt}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0 flex items-center gap-3">
        <button onClick={onBack} className="text-2xl active:opacity-50 leading-none px-1">←</button>
        <div>
          <h2 className="text-lg font-bold">💰 グレード時給表</h2>
          <p className="text-xs opacity-75">あなたのグレード列は緑でハイライト</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto pb-32">
        {loading && <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>}
        {error && <p className="text-red-400 text-sm text-center py-8">読み込み失敗</p>}
        {data && (
          <div className="p-3">
            {myGrade && (
              <p className="text-sm text-gray-700 mb-3">
                あなたのグレード:{' '}
                <span className="bg-line-green text-white px-2 py-0.5 rounded font-bold text-sm">{myGrade}</span>
                {myColIdx === -1 && <span className="text-xs text-amber-600 ml-1">（時給表に該当なし）</span>}
              </p>
            )}
            {renderSection('🎓 個別授業（1コマ＝80分の単価）', mmRows, '1コマ80分')}
            {renderSection('⏰ 一斉・自立・補習（時給）', hourRows, '時給')}
            <p className="text-[10px] text-gray-400 mt-3 text-center">※ 単位: 円</p>
          </div>
        )}
      </div>
    </div>
  )
}
