import { useState } from 'react'
import { getLocation } from '../utils/gps'

export default function NeedGpsDialog({ clockType, onSuccess, onCancel }) {
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')

  async function retry() {
    setRetrying(true)
    setError('')
    const loc = await getLocation()
    setRetrying(false)
    if (loc) {
      onSuccess(loc)
    } else {
      setError('位置情報を取得できませんでした。設定をご確認のうえ再試行してください。')
    }
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col p-6 gap-4 z-50">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="text-lg font-bold text-gray-800">
          {clockType === 'in' ? '入室には位置情報が必要です' : '退室には位置情報が必要です'}
        </h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          入退室の打刻には位置情報が必要です。<br />
          端末の設定で位置情報をONにしてから<br />
          「再取得する」を押してください。
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 text-xs text-gray-700 leading-relaxed space-y-1">
        <p className="font-semibold">📱 設定方法（iPhone）</p>
        <p className="ml-3">設定 → プライバシー → 位置情報サービス → ON<br />+ LINEの位置情報アクセスを「使用中のみ」</p>
        <p className="font-semibold mt-2">📱 設定方法（Android）</p>
        <p className="ml-3">設定 → 位置情報 → ON<br />+ LINEに位置情報の権限を許可</p>
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <div className="flex gap-2 mt-auto">
        <button onClick={onCancel} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl">
          キャンセル
        </button>
        <button onClick={retry} disabled={retrying}
          className="flex-1 py-3 bg-line-green text-white font-bold rounded-xl disabled:opacity-60">
          {retrying ? '取得中...' : '📍 再取得する'}
        </button>
      </div>
    </div>
  )
}
