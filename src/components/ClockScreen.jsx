import { useState, useEffect, useRef } from 'react'
import { postAttendance } from '../services/mockApi'
import { fetchTodayAttendance, fetchMyErrors, fetchAllErrors, resolveError } from '../services/firestoreService'
import { getLocation, isAwayFromJuku } from '../utils/gps'
import { closeLiff } from '../services/liffService'
import ReportForm from './ReportForm'
import NeedGpsDialog from './NeedGpsDialog'
import FarWarningDialog from './FarWarningDialog'
import ZReasonDialog from './ZReasonDialog'
import RetroClockInDialog from './RetroClockInDialog'
import AdminWorkEntryScreen from './AdminWorkEntryScreen'

// ─── 時刻ユーティリティ ──────────────────────────────────────────────────────

function getNow() {
  const d = new Date()
  return {
    time: d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timeShort: d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    date: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
    isoDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  }
}

function calcElapsed(clockInTime) {
  if (!clockInTime) return ''
  const [h, m] = clockInTime.split(':').map(Number)
  const now = new Date()
  const diff = now - new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分`
  return `${Math.floor(mins / 60)}時間${mins % 60}分`
}

// ─── セッション管理 ──────────────────────────────────────────────────────────

const SESSION_KEY = 'juku_clock_session'

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

function restoreSession(todayDate) {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.date !== todayDate) { clearSession(); return null }
    return data
  } catch { return null }
}

// ─── ステータス定数 ──────────────────────────────────────────────────────────

const STATUS = { IDLE: 'idle', WORKING: 'working', REPORTED: 'reported', DONE: 'done' }

// ─── ステップカード共通パーツ ────────────────────────────────────────────────

function StepBadge({ n, active }) {
  return (
    <span className={`text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 ${active ? 'bg-line-green' : 'bg-gray-400'}`}>
      {n}
    </span>
  )
}

function Arrow() {
  return <div className="text-center text-gray-300 text-xl leading-none pt-1">↓</div>
}

// ─── お知らせ集約カード ──────────────────────────────────────────────────────

function UrgentCard({ items, onNoticeClick }) {
  const urgent = items.filter(i => !i.confirmed || (i.type === 'タスク' && !i.completed))

  const cardCls = urgent.length === 0
    ? 'bg-green-50 border-2 border-green-200 rounded-2xl shadow-sm p-3'
    : 'bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm p-3'
  const borderCls = urgent.length === 0 ? 'border-green-200' : 'border-amber-200'

  return (
    <div className={cardCls}>
      <p className="text-sm font-bold text-gray-800 mb-2">
        {urgent.length === 0 ? '✅ すべて確認済み 🎉' : `⚠️ 確認が必要 (${urgent.length}件)`}
      </p>
      {urgent.length === 0 ? (
        <p className="text-xs text-gray-600">お知らせ・タスクは全件対応済みです</p>
      ) : (
        <div className="space-y-1">
          {urgent.slice(0, 5).map(i => (
            <p key={i.itemId} className="text-xs text-gray-800 leading-relaxed">
              {!i.confirmed ? '❗' : '⏳'} {i.text}
              {i.dueDate && <span className="text-[10px] text-amber-700 ml-1">〆{i.dueDate}</span>}
            </p>
          ))}
          {urgent.length > 5 && (
            <p className="text-[11px] text-amber-600 text-right">他 {urgent.length - 5} 件</p>
          )}
        </div>
      )}
      <button
        onClick={onNoticeClick}
        className={`w-full text-xs text-line-green font-semibold py-2 mt-2 border-t ${borderCls} active:bg-green-100`}
      >
        📋 すべてのお知らせを見る →
      </button>
    </div>
  )
}

// ─── Zエラーバナー ───────────────────────────────────────────────────────────

function ErrorBanner({ errors, isAdmin, onResolve, onFix }) {
  if (errors.length === 0) return null
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-2xl shadow-sm p-3 space-y-2">
      <p className="text-sm font-bold text-red-700">🚨 勤務記録に確認が必要なエラーがあります（{errors.length}件）</p>
      {errors.map(err => (
        <div key={err.id} className="bg-white border border-red-200 rounded-xl p-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800">
              {err.date} {isAdmin && <span className="text-red-600">　{err.name} 先生</span>}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{err.detail}</p>
          </div>
          {isAdmin ? (
            <button
              onClick={() => onResolve(err.id)}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 active:bg-red-600">
              ✓ 解決
            </button>
          ) : (
            <button
              onClick={() => onFix(err)}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 active:bg-red-600">
              修正する
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function ClockScreen({ staff, lineProfile, items = [], onNoticeClick }) {
  const [clock, setClock] = useState(getNow())
  const [status, setStatus] = useState(STATUS.IDLE)
  const [clockInTime, setClockInTime] = useState(null)
  const [commute, setCommute] = useState(staff.commutes?.[0] || null)
  const [showReport, setShowReport] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [clockingIn, setClockingIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [gpsModal, setGpsModal] = useState(null)
  const [minExitDate, setMinExitDate] = useState(null)
  const [clockOutError, setClockOutError] = useState('')
  const [showRetroDialog, setShowRetroDialog] = useState(false)
  const [showAdminMode, setShowAdminMode] = useState(false)
  const [submittedLessons, setSubmittedLessons] = useState(null)
  const [showClockInOverlay, setShowClockInOverlay] = useState(false)
  const [doneCountdown, setDoneCountdown] = useState(15)
  const doneTimerRef = useRef(null)
  const [errors, setErrors] = useState([])
  const [fixingError, setFixingError] = useState(null)

  const isShain = staff.grade === '社員'
  const isAdmin = !!staff.isAdmin

  // 時計 & 経過時間の更新
  useEffect(() => {
    const id = setInterval(() => {
      setClock(getNow())
      setElapsed(calcElapsed(clockInTime))
    }, 1000)
    return () => clearInterval(id)
  }, [clockInTime])

  // 退室完了後のカウントダウン
  useEffect(() => {
    if (status !== STATUS.DONE) { setDoneCountdown(15); return }
    doneTimerRef.current = setInterval(() => {
      setDoneCountdown(n => {
        if (n <= 1) { resetToIdle(); return 15 }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(doneTimerRef.current)
  }, [status])

  // セッション復元（localStorage → Firestore の順で試みる）
  useEffect(() => {
    const session = restoreSession(getNow().isoDate)
    if (session) {
      setStatus(session.status)
      setClockInTime(session.clockInTime)
      setElapsed(calcElapsed(session.clockInTime))
      if (session.minExitDate) setMinExitDate(new Date(session.minExitDate))
      if (session.lessons) setSubmittedLessons(session.lessons)
      return
    }

    fetchTodayAttendance(staff.staffId).then(({ clockIn, clockOut, session }) => {
      if (!clockIn) return
      const time = new Date(clockIn.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      if (clockOut) { setStatus(STATUS.DONE); return }
      setClockInTime(time)
      setElapsed(calcElapsed(time))
      if (session) {
        const med = session.minExitDate ? new Date(session.minExitDate) : null
        setStatus(STATUS.REPORTED)
        setMinExitDate(med)
        saveSession({ status: STATUS.REPORTED, clockInTime: time, date: getNow().isoDate, minExitDate: session.minExitDate })
      } else {
        setStatus(STATUS.WORKING)
        saveSession({ status: STATUS.WORKING, clockInTime: time, date: getNow().isoDate })
      }
    }).catch(err => console.warn('[Firestore] セッション復元失敗:', err))
  }, [])

  // Zエラー取得
  useEffect(() => {
    const fetch = isAdmin ? fetchAllErrors() : fetchMyErrors(staff.staffId)
    fetch.then(setErrors).catch(err => console.warn('[Firestore] エラー取得失敗:', err))
  }, [])

  async function handleResolveError(errorId) {
    await resolveError(errorId).catch(console.error)
    setErrors(prev => prev.filter(e => e.id !== errorId))
  }

  function handleFixError(err) {
    setFixingError(err)
    setShowReport(true)
  }

  function resetToIdle() {
    clearInterval(doneTimerRef.current)
    setStatus(STATUS.IDLE)
    setClockInTime(null)
    setElapsed('')
    setMinExitDate(null)
    setSubmittedLessons(null)
    setClockOutError('')
    setDoneCountdown(15)
  }

  // ─── 入室 ──────────────────────────────────────────────────────────────────

  async function handleClockIn() {
    setClockingIn(true)
    const location = await getLocation()
    setClockingIn(false)

    if (!location) {
      setGpsModal({
        type: 'need', clockType: 'in',
        onSuccess: (loc) => { setGpsModal(null); doClockIn(loc, '') },
        onCancel: () => setGpsModal(null),
      })
      return
    }

    const check = isAwayFromJuku(location)
    if (check?.isAway) {
      setGpsModal({
        type: 'far', clockType: 'in', distance: check.distance,
        onConfirm: (reason) => { setGpsModal(null); doClockIn(location, reason) },
        onCancel: () => setGpsModal(null),
      })
      return
    }

    doClockIn(location, '')
  }

  function doClockIn(location, reason, retroDate = null, retroCommute = null) {
    const { isoDate } = getNow()
    const ts = retroDate ? retroDate.toISOString() : new Date().toISOString()
    const timeStr = retroDate
      ? retroDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : getNow().timeShort
    const selectedCommute = retroCommute || commute

    // 社員は勤務記録スキップ → 入室後すぐ退室可能
    const nextStatus = isShain ? STATUS.REPORTED : STATUS.WORKING
    setClockInTime(timeStr)
    setStatus(nextStatus)
    setElapsed(calcElapsed(timeStr))
    saveSession({ status: nextStatus, clockInTime: timeStr, date: isoDate })

    // 入室成功オーバーレイ（1.5秒）
    if (!retroDate) {
      setShowClockInOverlay(true)
      setTimeout(() => setShowClockInOverlay(false), 1500)
    }

    postAttendance({
      staffId: staff.staffId, name: staff.name,
      type: 'in', timestamp: ts,
      location,
      commuteLabel: selectedCommute?.label || '',
      commuteAllowance: selectedCommute?.allowance || 0,
      reason,
    }).catch(() => {
      alert('入室打刻の送信に失敗しました。もう一度お試しください。')
      setClockInTime(null)
      setStatus(STATUS.IDLE)
      clearSession()
    })
  }

  function handleRetroConfirm(retroDate, retroCommute) {
    setShowRetroDialog(false)
    doClockIn(null, '[後付け] 打刻忘れ', retroDate, retroCommute)
  }

  // ─── 勤務記録送信後 ─────────────────────────────────────────────────────────

  function handleReportDone(newMinExitDate, lessonsRaw) {
    setShowReport(false)
    setStatus(STATUS.REPORTED)
    setMinExitDate(newMinExitDate || null)
    setSubmittedLessons(lessonsRaw || null)
    if (fixingError) {
      resolveError(fixingError.id).catch(console.error)
      setErrors(prev => prev.filter(e => e.id !== fixingError.id))
      setFixingError(null)
    }
    saveSession({
      status: STATUS.REPORTED, clockInTime, date: clock.isoDate,
      minExitDate: newMinExitDate ? newMinExitDate.toISOString() : null,
      lessons: lessonsRaw || null,
    })
  }

  // ─── 退室 ──────────────────────────────────────────────────────────────────

  async function handleClockOut() {
    // 最低退室時刻チェック
    const now = new Date()
    if (minExitDate && now < minExitDate) {
      const minStr = minExitDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      setClockOutError(`⚠️ ${minStr} 以降に退室してください`)
      return
    }
    setClockOutError('')

    setClockingOut(true)
    const location = await getLocation()
    setClockingOut(false)

    if (!location) {
      setGpsModal({
        type: 'need', clockType: 'out',
        onSuccess: (loc) => { setGpsModal(null); proceedClockOut(loc, '') },
        onCancel: () => setGpsModal(null),
      })
      return
    }

    const check = isAwayFromJuku(location)
    if (check?.isAway) {
      setGpsModal({
        type: 'far', clockType: 'out', distance: check.distance,
        onConfirm: (farReason) => { setGpsModal(null); proceedClockOut(location, farReason) },
        onCancel: () => setGpsModal(null),
      })
      return
    }

    proceedClockOut(location, '')
  }

  function proceedClockOut(location, farReason) {
    // Z チェック：退室時刻 - 最低退室時刻 ≥ 1h なら理由選択
    if (minExitDate) {
      const Z = (new Date() - minExitDate) / 3600000
      if (Z >= 1) {
        const zh = Math.floor(Z)
        const zm = Math.round((Z - zh) * 60)
        setGpsModal({
          type: 'z-reason',
          zText: `時間差 ${zh}時間${zm > 0 ? zm + '分' : ''}（通常は15分以内が目安）`,
          onConfirm: (zReason) => {
            setGpsModal(null)
            submitClockOut(location, farReason ? `${farReason} / ${zReason}` : zReason)
          },
        })
        return
      }
    }
    submitClockOut(location, farReason)
  }

  function submitClockOut(location, reason) {
    clearSession()
    setMinExitDate(null)
    setStatus(STATUS.DONE)

    postAttendance({
      staffId: staff.staffId, name: staff.name,
      type: 'out', timestamp: new Date().toISOString(),
      location,
      reason,
    }).catch(() => {
      alert('退室打刻の送信に失敗しました。塾長に退室時刻をご連絡ください。')
    })
  }

  // ─── 勤務記録フォーム ───────────────────────────────────────────────────────

  if (showReport) {
    return (
      <ReportForm
        staff={staff}
        date={clock.isoDate}
        clockInTime={clockInTime}
        initialLessons={submittedLessons}
        onComplete={handleReportDone}
      />
    )
  }

  if (showAdminMode && isAdmin) {
    return <AdminWorkEntryScreen currentStaff={staff} onClose={() => setShowAdminMode(false)} />
  }

  // ─── ヘッダー ───────────────────────────────────────────────────────────────

  const avatarChar = staff.name?.[0] || '?'

  return (
    <div className="relative flex flex-col h-full">

      {/* GPS ダイアログ（オーバーレイ） */}
      {gpsModal?.type === 'need' && (
        <NeedGpsDialog
          clockType={gpsModal.clockType}
          onSuccess={gpsModal.onSuccess}
          onCancel={gpsModal.onCancel}
        />
      )}
      {gpsModal?.type === 'far' && (
        <FarWarningDialog
          clockType={gpsModal.clockType}
          distance={gpsModal.distance}
          onConfirm={gpsModal.onConfirm}
          onCancel={gpsModal.onCancel}
        />
      )}
      {gpsModal?.type === 'z-reason' && (
        <ZReasonDialog
          zText={gpsModal.zText}
          onConfirm={gpsModal.onConfirm}
        />
      )}
      {showRetroDialog && (
        <RetroClockInDialog
          staff={staff}
          onConfirm={handleRetroConfirm}
          onCancel={() => setShowRetroDialog(false)}
        />
      )}
      {showClockInOverlay && (
        <div className="absolute inset-0 bg-line-green flex flex-col items-center justify-center gap-4 z-50">
          <div className="text-7xl">✅</div>
          <p className="text-white text-2xl font-bold">入室しました！</p>
          <p className="text-white/80 text-base">{clockInTime} 入室</p>
        </div>
      )}

      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {lineProfile?.pictureUrl ? (
            <img src={lineProfile.pictureUrl} alt="" className="w-11 h-11 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-white/30 flex items-center justify-center text-xl font-bold flex-shrink-0">
              {avatarChar}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg leading-tight">
              {staff.name} 先生
              {staff.grade && (
                <span className="ml-1 text-xs bg-white/30 px-2 py-0.5 rounded font-medium align-middle">{staff.grade}</span>
              )}
            </p>
            <p className="text-sm opacity-80">こんにちは！お疲れ様です 🌟</p>
          </div>
          <p className="text-lg font-mono font-semibold opacity-90 flex-shrink-0">{clock.timeShort}</p>
        </div>
        <p className="text-xs opacity-70 mt-2">{clock.date}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-6">

        <ErrorBanner
          errors={errors}
          isAdmin={isAdmin}
          onResolve={handleResolveError}
          onFix={handleFixError}
        />

        <UrgentCard items={items} onNoticeClick={onNoticeClick} />

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAdminMode(true)}
            className="w-full bg-white border border-emerald-200 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between active:bg-emerald-50"
          >
            <span className="text-sm font-bold text-gray-800">管理者モード</span>
            <span className="text-xs text-line-green font-semibold">代理入力へ</span>
          </button>
        )}

        {/* ── 入室前モード ─────────────────────────────────────────────────── */}
        {status === STATUS.IDLE && (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
              <div className="flex items-center gap-2 mb-3">
                <StepBadge n={1} active />
                <span className="text-sm font-bold text-gray-700">入室</span>
                <span className="text-xs font-bold text-line-green ml-auto bg-green-100 px-2 py-0.5 rounded-full">いま</span>
              </div>
              {staff.commutes?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">通勤手段</p>
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
              <button onClick={handleClockIn} disabled={clockingIn}
                className="w-full py-4 bg-line-green text-white text-lg font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-60">
                {clockingIn ? '📍 位置情報取得中...' : '🟢 入室する'}
              </button>
              <button type="button" onClick={() => setShowRetroDialog(true)}
                className="w-full mt-2 py-2 border-2 border-dashed border-amber-400 text-amber-600 text-sm font-semibold rounded-xl active:bg-amber-50">
                ⏰ 入室を忘れた（後付け修正）
              </button>
            </div>

            <Arrow />
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-gray-300 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <StepBadge n={2} active={false} />
                <span className="text-sm font-bold text-gray-700">授業</span>
              </div>
              <p className="text-xs text-gray-500 ml-8">📲 最小化して授業へ。LINEからいつでも戻れます。</p>
            </div>

            <Arrow />
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-gray-300 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <StepBadge n={3} active={false} />
                <span className="text-sm font-bold text-gray-700">comiru記入、社員へ報告</span>
              </div>
            </div>

            <Arrow />
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-gray-300 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <StepBadge n={4} active={false} />
                <span className="text-sm font-bold text-gray-800">勤務記録入力</span>
                <span className="text-xs ml-auto">🔒</span>
              </div>
              <p className="text-xs text-gray-500 ml-8">入室後にできるようになります</p>
            </div>

            <Arrow />
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-gray-300 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <StepBadge n={5} active={false} />
                <span className="text-sm font-bold text-gray-800">退室</span>
                <span className="text-xs ml-auto">🔒</span>
              </div>
              <p className="text-xs text-gray-500 ml-8">勤務記録の送信後にできます</p>
            </div>
          </>
        )}

        {/* ── 授業中モード ─────────────────────────────────────────────────── */}
        {status === STATUS.WORKING && (
          <>
            <div className="bg-gray-100 rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
              <div className="flex items-center gap-2 mb-1">
                <StepBadge n={1} active />
                <span className="text-sm font-bold text-gray-700">入室</span>
                <span className="text-xs font-bold text-line-green ml-auto">✅ 完了</span>
              </div>
              <p className="text-sm text-gray-700 ml-8">{clockInTime} 入室・{elapsed}経過</p>
            </div>

            <Arrow />
            <div className="bg-green-50 rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
              <div className="flex items-center gap-2 mb-3">
                <StepBadge n={2} active />
                <span className="text-sm font-bold text-gray-700">授業</span>
                <span className="text-xs font-bold text-line-green ml-auto bg-green-100 px-2 py-0.5 rounded-full">いま</span>
              </div>
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                授業を行ってください。<br />LINEからいつでも戻れます。
              </p>
              <button onClick={() => closeLiff()}
                className="mt-3 w-full py-2 border border-gray-300 text-gray-500 text-xs font-semibold rounded-xl active:bg-gray-100">
                📲 最小化（LINEを閉じる）
              </button>
            </div>

            <Arrow />
            <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
              <div className="flex items-center gap-2 mb-2">
                <StepBadge n={3} active />
                <span className="text-sm font-bold text-gray-700">comiru記入、社員へ報告</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed ml-8">
                📝 comiru報告書を記入<br />
                👥 社員へ報告
              </p>
              <div className="mt-3 ml-8 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-700 leading-relaxed">
                  🧹 22:00まで授業の先生は一緒にそうじを手伝ってください！<br />
                  <span className="text-gray-500">（毎週月・木、ゴミ出し）</span><br />
                  <span className="text-line-green font-semibold">事務 0.25h つけてね</span>
                </p>
              </div>
            </div>

            {isShain ? (
              <>
                <Arrow />
                <div className="bg-green-50 rounded-2xl shadow-md p-5 border-2 border-line-green">
                  <div className="flex items-center gap-2 mb-3">
                    <StepBadge n={4} active />
                    <span className="text-base font-bold text-gray-800">退室</span>
                    <span className="text-xs font-bold text-line-green ml-auto bg-green-100 px-2 py-0.5 rounded-full">いま</span>
                  </div>
                  <button onClick={handleClockOut} disabled={clockingOut}
                    className="w-full py-5 bg-line-green text-white text-xl font-bold rounded-xl shadow-md active:scale-95 transition-transform disabled:opacity-60">
                    {clockingOut ? '📍 位置情報取得中...' : '🔴 退室する'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Arrow />
                <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green">
                  <div className="flex items-center gap-2 mb-3">
                    <StepBadge n={4} active />
                    <span className="text-sm font-bold text-gray-800">勤務記録入力</span>
                  </div>
                  <button onClick={() => setShowReport(true)}
                    className="w-full py-4 bg-line-green text-white text-lg font-bold rounded-xl shadow active:scale-95 transition-transform">
                    📝 勤務記録を入力する
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-3">退室するまで、アプリを閉じずに</p>
                </div>

                <Arrow />
                <div className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-line-green opacity-70">
                  <div className="flex items-center gap-2 mb-3">
                    <StepBadge n={5} active />
                    <span className="text-sm font-bold text-gray-800">退室</span>
                    <span className="text-xs ml-auto">🔒</span>
                  </div>
                  <button disabled
                    className="w-full py-4 bg-gray-300 text-gray-400 text-lg font-bold rounded-xl">
                    🔒 退室する
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-2">勤務記録の送信後に退室できます</p>
                </div>
              </>
            )}
          </>
        )}

        {/* ── 退室待ちモード（記録送信後） ─────────────────────────────────── */}
        {status === STATUS.REPORTED && (
          <>
            <div className="bg-gray-100 rounded-2xl shadow-sm p-3 border-l-4 border-line-green">
              <p className="text-sm text-gray-700 font-semibold">
                {isShain ? '✅ 入室 完了' : '✅ 入室・授業・報告・勤務記録 完了'}
              </p>
              <p className="text-xs text-gray-500 mt-1">{clockInTime} 入室・{elapsed}経過</p>
              {!isShain && (
                <button onClick={() => setShowReport(true)}
                  className="mt-2 w-full text-xs text-gray-500 underline py-1 text-center">
                  📝 勤務記録を修正する
                </button>
              )}
            </div>

            <div className="bg-green-50 rounded-2xl shadow-md p-5 border-2 border-line-green">
              <div className="flex items-center gap-2 mb-4">
                <StepBadge n={5} active />
                <span className="text-base font-bold text-gray-800">退室</span>
                <span className="text-xs font-bold text-line-green ml-auto bg-green-100 px-2 py-0.5 rounded-full">いま</span>
              </div>
              {minExitDate && new Date() < minExitDate && (
                <p className="text-amber-600 text-sm font-semibold text-center mb-3">
                  🕐 {minExitDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 以降に退室できます
                </p>
              )}
              {clockOutError && (
                <p className="text-red-600 text-sm font-semibold text-center mb-3">{clockOutError}</p>
              )}
              <button onClick={handleClockOut} disabled={clockingOut}
                className="w-full py-5 bg-line-green text-white text-xl font-bold rounded-xl shadow-md active:scale-95 transition-transform disabled:opacity-60">
                {clockingOut ? '📍 位置情報取得中...' : '🔴 退室する'}
              </button>
            </div>
          </>
        )}

        {/* ── 退室完了 ─────────────────────────────────────────────────────── */}
        {status === STATUS.DONE && (
          <div className="flex flex-col items-center justify-center py-16 gap-5 px-6 text-center">
            <p className="text-6xl">🎉</p>
            <p className="text-xl font-bold text-gray-800">退室しました</p>
            <p className="text-gray-500 text-sm">お疲れ様でした！</p>
            <button onClick={resetToIdle}
              className="px-8 py-3 bg-line-green text-white text-lg font-bold rounded-2xl shadow-md active:scale-95 transition-transform">
              🏠 ホームに戻る
            </button>
            <p className="text-xs text-gray-400">または {doneCountdown}秒後に自動でホームへ</p>
          </div>
        )}

      </div>
    </div>
  )
}
