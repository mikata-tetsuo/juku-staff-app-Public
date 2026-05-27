import { useState } from 'react'

export default function RetroClockInDialog({ staff, onConfirm, onCancel }) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [retroTime, setRetroTime] = useState(defaultTime)
  const [commute, setCommute] = useState(staff.commutes?.[0] || null)
  const [error, setError] = useState('')

  function confirm() {
    const [h, m] = retroTime.split(':').map(Number)
    const n = new Date()
    const retroDate = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m)
    if (retroDate > n) {
      setError('未来の時刻は入力できません')
      return
    }
    onConfirm(retroDate, commute)
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col p-6 gap-4 z-50">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">⏰</div>
        <h2 className="text-lg font-bold text-gray-800">入室時刻を修正</h2>
        <p className="text-gray-500 text-sm mt-1">実際の入室時刻を入力してください</p>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">入室時刻</label>
          <input
            type="time"
            value={retroTime}
            onChange={e => { setRetroTime(e.target.value); setError('') }}
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-2xl text-center font-mono focus:border-line-green focus:outline-none"
          />
          {error && <p className="text-red-500 text-sm mt-1 text-center">{error}</p>}
        </div>

        {staff.commutes?.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">通勤手段</p>
            <div className="flex gap-2 flex-wrap">
              {staff.commutes.map((c, i) => (
                <button key={i} type="button"
                  onClick={() => setCommute(c)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all
                    ${commute?.label === c.label
                      ? 'bg-line-green text-white border-line-green'
                      : 'bg-white text-gray-600 border-gray-300'}`}>
                  {c.label}（{c.allowance > 0 ? `${c.allowance}円` : '手当なし'}）
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-4 border-2 border-gray-300 text-gray-600 font-bold rounded-xl">
          キャンセル
        </button>
        <button onClick={confirm}
          className="flex-1 py-4 bg-amber-500 text-white font-bold rounded-xl shadow-md active:scale-95 transition-transform">
          ✅ 入室する
        </button>
      </div>
    </div>
  )
}
