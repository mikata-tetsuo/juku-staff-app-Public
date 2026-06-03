import { useEffect, useState } from 'react'
import { fetchAdminWorkEntry, saveAdminWorkEntry } from '../services/mockApi'
import ReportForm from './ReportForm'

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

export default function StaffFixScreen({ staff, error, onComplete, onCancel }) {
  const [clockInTime, setClockInTime] = useState('')
  const [clockOutTime, setClockOutTime] = useState('')
  const [commuteLabel, setCommuteLabel] = useState(staff.commutes?.[0]?.label || '')
  const [existingLessons, setExistingLessons] = useState([])
  const [loadingEntry, setLoadingEntry] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('setup')
  const [formError, setFormError] = useState('')

  const date = error.date
  const isEmployee = staff.grade === '社員'
  const commute = staff.commutes?.find(c => c.label === commuteLabel) || staff.commutes?.[0] || null

  useEffect(() => {
    fetchAdminWorkEntry({ adminLineUserId: staff.lineUserId, staffId: staff.staffId, date })
      .then(data => {
        const lessons = (data.lessons || []).map(lessonPayloadToFormLesson).filter(l => l.type)
        setClockInTime(data.clockInTime || '')
        setClockOutTime(data.clockOutTime || '')
        setCommuteLabel(data.commuteLabel || staff.commutes?.[0]?.label || '')
        setExistingLessons(lessons)
      })
      .catch(() => setFormError('既存データを取得できませんでした。'))
      .finally(() => setLoadingEntry(false))
  }, [staff, date])

  async function startFix() {
    setFormError('')
    if (!clockInTime || !clockOutTime) {
      setFormError('入室・退室時刻を入力してください。')
      return
    }
    if (minutesOf(clockOutTime) <= minutesOf(clockInTime)) {
      setFormError('退室時刻は入室時刻より後にしてください。')
      return
    }
    if (isEmployee) {
      setSaving(true)
      try {
        await saveAdminWorkEntry({
          adminLineUserId: staff.lineUserId,
          adminName: staff.name,
          staffId: staff.staffId,
          name: staff.name,
          date,
          clockInTime,
          clockOutTime,
          commuteLabel: commute?.label || '',
          commuteAllowance: commute?.allowance || 0,
          lessons: [],
          V: 0,
        })
        onComplete()
      } catch {
        setFormError('保存に失敗しました。もう一度お試しください。')
      } finally {
        setSaving(false)
      }
      return
    }
    setStep('report')
  }

  async function submitFix(payload) {
    await saveAdminWorkEntry({
      adminLineUserId: staff.lineUserId,
      adminName: staff.name,
      staffId: staff.staffId,
      name: staff.name,
      date,
      clockInTime,
      clockOutTime,
      commuteLabel: commute?.label || '',
      commuteAllowance: commute?.allowance || 0,
      lessons: payload.lessons,
      V: payload.V,
    })
    onComplete()
  }

  if (step === 'report') {
    return (
      <ReportForm
        staff={staff}
        date={date}
        clockInTime={clockInTime}
        clockOutTimeOverride={clockOutTime}
        initialLessons={existingLessons}
        skipTimeValidation={false}
        overageToleranceHours={0}
        adminMode
        title="エラーを修正"
        submitLabel="この内容で修正保存"
        doneMessage="修正を保存しました"
        onCancel={() => setStep('setup')}
        onComplete={onComplete}
        submitReport={submitFix}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-red-500 text-white px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-semibold">
            戻る
          </button>
          <div>
            <h2 className="text-lg font-bold">勤務記録を修正</h2>
            <p className="text-xs opacity-80">{date} の入退室・勤務記録</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p className="font-semibold mb-1">エラー内容</p>
          <p>{error.detail}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          {loadingEntry ? (
            <p className="text-sm text-gray-500 text-center py-2">既存データを確認中...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">入室時刻</label>
                <input
                  type="time"
                  value={clockInTime}
                  onChange={e => setClockInTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">退室時刻</label>
                <input
                  type="time"
                  value={clockOutTime}
                  onChange={e => setClockOutTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
          )}

          {staff.commutes?.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">通勤手段</label>
              <select
                value={commuteLabel}
                onChange={e => setCommuteLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                {staff.commutes.map((c, i) => (
                  <option key={`${c.label}-${i}`} value={c.label}>
                    {c.label}{c.allowance > 0 ? `（${c.allowance}円）` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formError && (
            <div className="rounded-xl p-3 text-sm bg-red-50 border border-red-200 text-red-700">
              {formError}
            </div>
          )}

          <button
            type="button"
            onClick={startFix}
            disabled={loadingEntry || saving}
            className="w-full py-4 bg-red-500 text-white text-lg font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? '保存中...' : isEmployee ? '修正を保存する' : '授業内容を確認・修正する →'}
          </button>
        </div>
      </div>
    </div>
  )
}
