export default function ShortcutGuideScreen({ onBack }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0 flex items-center gap-3">
        <button onClick={onBack} className="text-2xl active:opacity-50 leading-none px-1">←</button>
        <div>
          <h2 className="text-lg font-bold">📌 アプリを楽に開く方法</h2>
          <p className="text-xs opacity-75">毎日使うので設定しておくと便利♪</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4 pb-32 space-y-3">

        <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
          <h3 className="text-base font-bold text-gray-800 mb-2">⭐ 方法① LINEで「お気に入り登録」</h3>
          <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside leading-relaxed">
            <li>このアプリのURLメッセージを長押し</li>
            <li>「<span className="font-semibold">Keep</span>」を選択して保存</li>
            <li>いつでもKeepから開ける ✨</li>
          </ol>
          <p className="text-xs text-gray-500 mt-2">
            または、グループや塾の公式アカウントを<span className="font-semibold">ピン留め</span>すれば、トーク一覧の一番上に固定されます📌
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
          <h3 className="text-base font-bold text-gray-800 mb-2">📱 方法② ホーム画面にショートカット</h3>
          <div className="mt-2 mb-3">
            <p className="text-sm font-bold text-gray-700 mb-1">🍎 iPhone（Safariで開く）</p>
            <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside leading-relaxed ml-2">
              <li>アプリのURLを <span className="font-semibold">Safari</span> で開く</li>
              <li>下の共有ボタン 📤 をタップ</li>
              <li>「<span className="font-semibold">ホーム画面に追加</span>」をタップ</li>
              <li>アイコンが追加される ✨</li>
            </ol>
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold text-gray-700 mb-1">🤖 Android（Chromeで開く）</p>
            <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside leading-relaxed ml-2">
              <li>アプリのURLを <span className="font-semibold">Chrome</span> で開く</li>
              <li>右上のメニュー ⋮ をタップ</li>
              <li>「<span className="font-semibold">ホーム画面に追加</span>」をタップ</li>
              <li>アイコンが追加される ✨</li>
            </ol>
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            ※アイコンの見た目は端末によって異なります<br />
            （中谷塾ロゴ／LINEアイコン／汎用アイコンなど）
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 text-xs text-gray-700 leading-relaxed">
          <p className="font-semibold mb-1">💡 ポイント</p>
          <p>どちらかひとつ設定しておけば、次回からアプリを<span className="font-semibold">タップ一発で起動</span>できます🚀</p>
        </div>

      </div>
    </div>
  )
}
