import { useState } from 'react'
import { postRegistration } from '../services/mockApi'
import { fetchStaffByLineId } from '../services/mockApi'

export default function RegisterScreen({ lineProfile }) {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState('form') // form | checking | auto | pending
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = name.replace(/[\s　]+/g, '')
    if (!trimmed) { alert('氏名を入力してください'); return }
    if (trimmed.length < 2) { alert('氏名はフルネームで入力してください'); return }

    setSubmitting(true)
    setPhase('checking')

    try {
      await postRegistration({ lineUserId: lineProfile?.userId, name: trimmed })

      // 自動承認されたか確認
      let staff = null
      try {
        staff = await fetchStaffByLineId(lineProfile?.userId)
      } catch {}

      setPhase(staff?.staffId ? 'auto' : 'pending')
    } catch {
      alert('送信に失敗しました。もう一度お試しください。')
      setPhase('form')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <h2 className="text-lg font-bold">
          {phase === 'checking' ? '⏳ 確認中...' : phase === 'auto' ? '✅ 登録完了' : '👋 はじめまして'}
        </h2>
        {phase === 'form' && <p className="text-xs opacity-75">講師登録のお申込み</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* 申請フォーム */}
        {phase === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">
              このアプリを使うには事前登録が必要です。<br />
              氏名（フルネーム）を入力して登録申請してください。<br />
              <span className="text-xs text-amber-700">※ 姓名の間にスペースは入れないでください</span>
            </p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 田中花子"
              className="w-full p-3 border-2 border-gray-200 rounded-xl mb-4 text-sm focus:outline-none focus:border-line-green"
            />
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-4 bg-line-green text-white font-bold rounded-2xl shadow-md active:scale-95 transition-transform disabled:opacity-60">
              📝 登録申請する
            </button>
            <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">
              管理者が確認・承認後、登録完了の連絡をします。<br />
              通常、数時間〜1日以内に承認されます。
            </p>
          </div>
        )}

        {/* 確認中 */}
        {phase === 'checking' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <div className="text-5xl mb-4">⏳</div>
            <p className="text-base font-bold text-gray-800 mb-2">登録を確認中...</p>
            <p className="text-sm text-gray-600">少々お待ちください</p>
          </div>
        )}

        {/* 自動承認 */}
        {phase === 'auto' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <p className="text-base font-bold text-gray-800 mb-2">登録完了！</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              登録が完了しました。<br />
              下のボタンでアプリを開き直してください。
            </p>
            <button onClick={() => location.reload()}
              className="mt-5 w-full py-3 bg-line-green text-white font-bold rounded-xl">
              🔄 アプリを開き直す
            </button>
          </div>
        )}

        {/* 手動承認待ち */}
        {phase === 'pending' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <div className="text-5xl mb-4">📨</div>
            <p className="text-base font-bold text-gray-800 mb-2">申請を受け付けました</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              管理者の確認をお待ちください。<br />
              承認後、再度このアプリを開けば<br />
              ご利用いただけます。
            </p>
            <p className="text-xs text-gray-400 mt-6">通常、数時間〜1日以内に承認されます。</p>
          </div>
        )}

      </div>
    </div>
  )
}
