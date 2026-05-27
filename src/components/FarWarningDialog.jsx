import { useState } from 'react'
import { fmtDistance } from '../utils/gps'

const REASONS = [
  '🚶 退室押し忘れ・帰り道で打刻',
  '🤒 体調不良で早退・遅刻',
  '🏫 教室外での業務（出張等）',
  '📝 その他',
]

export default function FarWarningDialog({ clockType, distance, onConfirm, onCancel }) {
  const [selected, setSelected] = useState('')
  const [otherText, setOtherText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function confirm() {
    if (!selected) { alert('理由を選択してください'); return }
    if (selected === '📝 その他' && !otherText.trim()) { alert('理由を入力してください'); return }
    const label = selected === '📝 その他' ? `その他: ${otherText.trim()}` : selected.replace(/^\S+\s/, '')
    const fullReason = `📍遠隔(${fmtDistance(distance)}) ${label}`
    setSubmitting(true)
    await onConfirm(fullReason)
    setSubmitting(false)
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col p-6 gap-4 z-50">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="text-lg font-bold text-gray-800">
          {clockType === 'in' ? '塾から離れた場所での入室' : '塾から離れた場所での退室'}
        </h2>
        <p className="text-orange-500 font-semibold mt-1">
          現在地は塾から約 {fmtDistance(distance)} 離れています
        </p>
        <p className="text-xs text-gray-500 mt-2">理由を選択してください</p>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        {REASONS.map(r => (
          <button key={r} onClick={() => setSelected(r)}
            className={`w-full py-3 px-4 border-2 rounded-xl text-sm text-left transition-colors
              ${selected === r
                ? 'bg-line-green text-white border-line-green'
                : 'border-gray-300 text-gray-700 bg-white'}`}>
            {r}
          </button>
        ))}
        {selected === '📝 その他' && (
          <input
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            placeholder="理由を入力"
            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          />
        )}
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onCancel} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl">
          キャンセル
        </button>
        <button onClick={confirm} disabled={submitting}
          className="flex-1 py-3 bg-line-green text-white font-bold rounded-xl disabled:opacity-60">
          {submitting ? '📤 送信中...' : 'この理由で打刻'}
        </button>
      </div>
    </div>
  )
}
