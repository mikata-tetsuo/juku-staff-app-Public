import { useEffect, useMemo, useState } from 'react'
import { fetchAdminWorkEntry, fetchStaffList, saveAdminWorkEntry } from '../services/mockApi'
import ReportForm from './ReportForm'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function minutesOf(time) {
  const [h, m] = (time || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function lessonPayloadToFormLesson(lesson) {
  const amount = String(lesson.amount || '')
  if (lesson.typeLabel === 'MM 1:1') {
    return { type: 'MM1:1', grade: lesson.grade || '', name: lesson.target || '', koma: amount, grade2: '', name2: '', hours: '', className: '' }
  }
  if (lesson.typeLabel === 'MM 1:2') {
    const [grade, grade2] = String(lesson.grade || '').split('/')
    const [name, name2] = String(lesson.target || '').split('/')
    return { type: 'MM1:2', grade: grade || '', grade2: grade2 || '', name: name || '', name2: name2 || '', koma: amount, hours: '', className: '' }
  }
  if (lesson.typeLabel === '自立') {
    return { type: 'jiritu', grade: lesson.grade || '', hours: amount, grade2: '', name: '', name2: '', koma: '', className: '' }
  }
  if (lesson.typeLabel === '一斉少人数(1〜8名)') {
    return { type: 'isshosho', grade: lesson.grade || '', className: lesson.target || '', hours: amount, grade2: '', name: '', name2: '', koma: '' }
  }
  if (lesson.typeLabel === '一斉多人数(9名以上)') {
    return { type: 'isshoota', grade: lesson.grade || '', className: lesson.target || '', hours: amount, grade2: '', name: '', name2: '', koma: '' }
  }
  if (lesson.typeLabel === '補習 or 事務') {
    return { type: 'hoshu', hours: amount, grade: '', grade2: '', name: '', name2: '', koma: '', className: '' }
  }
  return { type: '', grade: '', grade2: '', name: '', name2: '', koma: '', hours: '', className: '' }
}

export default function AdminWorkEntryScreen({ currentStaff, onClose }) {
  const [staffList, setStaffList] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [clockInTime, setClockInTime] = useState('16:00')
  const [clockOutTime, setClockOutTime] = useState('22:00')
  const [commuteLabel, setCommuteLabel] = useState('')
  const [existingLessons, setExistingLessons] = useState([])
  const [hasExisting, setHasExisting] = useState(false)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('setup')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchStaffList(currentStaff.lineUserId)
      .then(data => {
        const list = data.staff || []
        setStaffList(list)
        const firstId = list[0]?.staffId || ''
        setSelectedId(firstId)
      })
      .catch(() => setError('先生一覧を取得できませんでした。'))
  }, [currentStaff.lineUserId])

  const selectedStaff = useMemo(
    () => staffList.find(s => String(s.staffId) === String(selectedId)),
    [staffList, selectedId]
  )

  useEffect(() => {
    if (!selectedStaff || !date) return
    setLoadingEntry(true)
    setError('')
    fetchAdminWorkEntry({ adminLineUserId: currentStaff.lineUserId, staffId: selectedStaff.staffId, date })
      .then(data => {
        const lessons = (data.lessons || []).map(lessonPayloadToFormLesson).filter(l => l.type)
        const foundExisting = !!(data.clockInTime || data.clockOutTime || lessons.length)
        setClockInTime(foundExisting ? (data.clockInTime || '') : '16:00')
        setClockOutTime(foundExisting ? (data.clockOutTime || '') : '22:00')
        setCommuteLabel(data.commuteLabel || selectedStaff.commutes?.[0]?.label || '')
        setExistingLessons(lessons)
        setHasExisting(foundExisting)
      })
      .catch(() => setError('既存データを取得できませんでした。'))
      .finally(() => setLoadingEntry(false))
  }, [currentStaff.lineUserId, selectedStaff, date])

  const commute = selectedStaff?.commutes?.find(c => c.label === commuteLabel) || selectedStaff?.commutes?.[0] || null
  const isEmployee = selectedStaff?.grade === '社員'

  async function startReport() {
    setError('')
    setSaved(false)
    if (!selectedStaff) {
      setError('先生を選択してください。')
      return
    }
    if (!date || !clockInTime || !clockOutTime) {
      setError('日付・入室・退室時刻を入力してください。')
      return
    }
    if (minutesOf(clockOutTime) <= minutesOf(clockInTime)) {
      setError('退室時刻は入室時刻より後にしてください。')
      return
    }
    if (isEmployee) {
      setSaving(true)
      try {
        await saveAdminWorkEntry({
          adminLineUserId: currentStaff.lineUserId,
          adminName: currentStaff.name,
          staffId: selectedStaff.staffId,
          name: selectedStaff.name,
          date,
          clockInTime,
          clockOutTime,
          commuteLabel: commute?.label || '',
          commuteAllowance: commute?.allowance || 0,
          lessons: [],
          V: 0,
        })
        setSaved(true)
      } catch {
        setError('保存に失敗しました。もう一度お試しください。')
      } finally {
        setSaving(false)
      }
      return
    }
    setStep('report')
  }

  async function submitAdminReport(payload) {
    await saveAdminWorkEntry({
      adminLineUserId: currentStaff.lineUserId,
      adminName: currentStaff.name,
      staffId: selectedStaff.staffId,
      name: selectedStaff.name,
      date,
      clockInTime,
      clockOutTime,
      commuteLabel: commute?.label || '',
      commuteAllowance: commute?.allowance || 0,
      lessons: payload.lessons,
      V: payload.V,
    })
    setSaved(true)
  }

  function completeAdminEntry() {
    setStep('setup')
  }

  if (step === 'report' && selectedStaff) {
    return (
      <ReportForm
        staff={selectedStaff}
        date={date}
        clockInTime={clockInTime}
        clockOutTimeOverride={clockOutTime}
        initialLessons={existingLessons}
        skipTimeValidation={false}
        overageToleranceHours={0}
        adminMode
        title={hasExisting ? '管理者修正' : '管理者代理入力'}
        submitLabel={hasExisting ? 'この内容で修正保存' : '勤務記録を代理保存'}
        doneMessage={hasExisting ? '管理者修正を保存しました' : '勤務記録を代理保存しました'}
        onCancel={() => setStep('setup')}
        onComplete={completeAdminEntry}
        submitReport={submitAdminReport}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-line-green text-white px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-semibold">
            戻る
          </button>
          <div>
            <h2 className="text-lg font-bold">管理者モード</h2>
            <p className="text-xs opacity-80">既存データを確認して代理入力・修正</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">先生</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-line-green"
            >
              {staffList.map(s => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}（{s.staffId}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">勤務日</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-line-green"
            />
          </div>

          {loadingEntry ? (
            <div className="rounded-xl p-3 text-sm bg-gray-50 border border-gray-200 text-gray-500">
              既存データを確認中...
            </div>
          ) : (
            <div className={`rounded-xl p-3 text-sm border ${hasExisting ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {hasExisting ? `既存データあり：${clockInTime || '--:--'}〜${clockOutTime || '--:--'}${isEmployee ? '' : ` / 授業 ${existingLessons.length}件`}` : 'この日の既存データはありません。新規で代理入力します。'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">入室</label>
              <input
                type="time"
                value={clockInTime}
                onChange={e => setClockInTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-line-green"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">退室</label>
              <input
                type="time"
                value={clockOutTime}
                onChange={e => setClockOutTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-line-green"
              />
            </div>
          </div>

          {selectedStaff?.commutes?.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">通勤手段</label>
              <select
                value={commuteLabel}
                onChange={e => setCommuteLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-line-green"
              >
                {selectedStaff.commutes.map((c, i) => (
                  <option key={`${c.label}-${i}`} value={c.label}>
                    {c.label}{c.allowance > 0 ? `（${c.allowance}円）` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {saved && (
            <div className="rounded-xl p-3 text-sm bg-green-50 border border-green-200 text-green-700">
              保存しました。必要なら同じ日を再度選ぶと最新状態を確認できます。
            </div>
          )}

          {error && (
            <div className="rounded-xl p-3 text-sm bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={startReport}
            disabled={loadingEntry || saving || staffList.length === 0}
            className="w-full py-4 bg-line-green text-white text-lg font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? '保存中...' : isEmployee ? '出退室を保存する' : hasExisting ? '授業内容を確認・修正する' : '授業内容を入力する'}
          </button>
        </div>
      </div>
    </div>
  )
}
