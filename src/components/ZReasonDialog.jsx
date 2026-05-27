import { useState } from 'react'

const REASONS = ['☕ 休憩', '🚶 途中外出', '🏠 途中帰宅', '✏️ その他']

export default function ZReasonDialog({ zText, onConfirm }) {
  const [selected, setSelected] = useState('')
  const [otherText, setOtherText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function confirm() {
    if (!selected) { alert('理由を選択してください'); return }
    if (selected === '✏️ その他' && !otherText.trim()) { alert('理由を入力してください'); return }
    const reason = selected === '✏️ その他' ? `その他: ${otherText.trim()}` : selected.replace(/^\S+\s/, '')
    setSubmitting(true)
    await onConfirm(reason)
    setSubmitting(false)
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col p-6 gap-4 z-50">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">⚠️</div>
        <h2 className="text-lg font-bold text-gray-800">滞在時間と勤務記録に差があります</h2>
        <p className="text-orange-500 font-semibold mt-2 text-sm">{zText}</p>
        <p className="text-gray-500 text-sm mt-1">理由を選択して退室してください</p>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {REASONS.map(r => (
          <button key={r} onClick={() => setSelected(r)}
            className={`w-full py-4 rounded-2xl border-2 text-base font-semibold transition-all
              ${selected === r
                ? 'bg-line-green text-white border-line-green'
                : 'border-gray-300 text-gray-700 bg-white'}`}>
            {r}
          </button>
        ))}
        {selected === '✏️ その他' && (
          <textarea
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            placeholder="理由を入力してください"
            className="w-full border-2 border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:border-line-green focus:outline-none"
          />
        )}
      </div>

      <button onClick={confirm} disabled={submitting}
        className="mt-auto w-full py-5 bg-line-green text-white text-xl font-bold rounded-2xl shadow-md active:scale-95 transition-transform disabled:opacity-60">
        {submitting ? '📤 送信中...' : '🟢 退室する'}
      </button>
    </div>
  )
}
