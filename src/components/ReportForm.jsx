import { useState } from 'react'
import { postReport } from '../services/mockApi'

const GRADES = ['小学生', '中学生', '高校生']
const KOMA_OPTS = Array.from({ length: 8 }, (_, i) => (i + 1) * 0.25)
const HOUR_OPTS = Array.from({ length: 32 }, (_, i) => Math.round((i + 1) * 25) / 100)

const TYPE_LABELS = {
  'MM1:1':    'MM 1:1',
  'MM1:2':    'MM 1:2',
  'jiritu':   '自立',
  'isshosho': '一斉少人数(1〜8名)',
  'isshoota': '一斉多人数(9名以上)',
  'hoshu':    '補習 or 事務',
}

const sel = `border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-line-green`
const inp = `border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-line-green w-full`

function emptyLesson() {
  return { type: '', grade: '', grade2: '', name: '', name2: '', koma: '', hours: '', className: '' }
}

function LessonCard({ idx, lesson, onChange, onRemove }) {
  const update = (field, value) => onChange(idx, field, value)

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold text-gray-700">授業 {idx + 1}</span>
        {idx > 0 && (
          <button type="button" onClick={() => onRemove(idx)} className="text-red-400 text-xs font-medium">削除</button>
        )}
      </div>

      <select value={lesson.type} onChange={e => update('type', e.target.value)}
        className={`w-full ${sel}`}>
        <option value="">授業の種類を選択</option>
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>

      {lesson.type === 'MM1:1' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select value={lesson.grade} onChange={e => update('grade', e.target.value)} className={sel}>
              <option value="">学年を選択</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={lesson.koma} onChange={e => update('koma', e.target.value)} className={sel}>
              <option value="">コマ数</option>
              {KOMA_OPTS.map(k => (
                <option key={k} value={k}>{k}コマ（{Math.round(k * 80)}分）</option>
              ))}
            </select>
          </div>
          <input value={lesson.name} onChange={e => update('name', e.target.value)}
            placeholder="生徒名" className={inp} />
        </>
      )}

      {lesson.type === 'MM1:2' && (
        <>
          <p className="text-xs text-gray-400">生徒1</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={lesson.grade} onChange={e => update('grade', e.target.value)} className={sel}>
              <option value="">学年を選択</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={lesson.name} onChange={e => update('name', e.target.value)}
              placeholder="生徒名" className={sel} />
          </div>
          <p className="text-xs text-gray-400">生徒2</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={lesson.grade2} onChange={e => update('grade2', e.target.value)} className={sel}>
              <option value="">学年を選択</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={lesson.name2} onChange={e => update('name2', e.target.value)}
              placeholder="生徒名" className={sel} />
          </div>
          <select value={lesson.koma} onChange={e => update('koma', e.target.value)} className={`w-full ${sel}`}>
            <option value="">コマ数</option>
            {KOMA_OPTS.map(k => (
              <option key={k} value={k}>{k}コマ（{Math.round(k * 80)}分）</option>
            ))}
          </select>
        </>
      )}

      {lesson.type === 'jiritu' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={lesson.grade} onChange={e => update('grade', e.target.value)} className={sel}>
            <option value="">学年を選択</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={lesson.hours} onChange={e => update('hours', e.target.value)} className={sel}>
            <option value="">時間</option>
            {HOUR_OPTS.map(h => <option key={h} value={h}>{h}h</option>)}
          </select>
        </div>
      )}

      {(lesson.type === 'isshosho' || lesson.type === 'isshoota') && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select value={lesson.grade} onChange={e => update('grade', e.target.value)} className={sel}>
              <option value="">学年を選択</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={lesson.hours} onChange={e => update('hours', e.target.value)} className={sel}>
              <option value="">時間</option>
              {HOUR_OPTS.map(h => <option key={h} value={h}>{h}h</option>)}
            </select>
          </div>
          <input value={lesson.className} onChange={e => update('className', e.target.value)}
            placeholder="クラス名（例: 中2A数学）" className={inp} />
        </>
      )}

      {lesson.type === 'hoshu' && (
        <select value={lesson.hours} onChange={e => update('hours', e.target.value)} className={`w-full ${sel}`}>
          <option value="">時間</option>
          {HOUR_OPTS.map(h => <option key={h} value={h}>{h}h</option>)}
        </select>
      )}
    </div>
  )
}

function calcV(lessons) {
  return lessons.reduce((total, l) => {
    if (l.type === 'MM1:1' || l.type === 'MM1:2') return total + (parseFloat(l.koma) || 0) * (80 / 60)
    return total + (parseFloat(l.hours) || 0)
  }, 0)
}

function buildLessonPayload(lessons) {
  return lessons.map(l => {
    const typeLabel = TYPE_LABELS[l.type] || l.type
    if (l.type === 'MM1:1') {
      return { typeLabel, grade: l.grade, target: l.name, amount: parseFloat(l.koma) || 0, unit: 'コマ' }
    }
    if (l.type === 'MM1:2') {
      return { typeLabel, grade: `${l.grade}/${l.grade2}`, target: [l.name, l.name2].filter(Boolean).join('/'), amount: parseFloat(l.koma) || 0, unit: 'コマ' }
    }
    if (l.type === 'isshosho' || l.type === 'isshoota') {
      return { typeLabel, grade: l.grade, target: l.className, amount: parseFloat(l.hours) || 0, unit: 'h' }
    }
    return { typeLabel, grade: l.grade || '', target: '', amount: parseFloat(l.hours) || 0, unit: 'h' }
  })
}

export default function ReportForm({ staff, date, clockInTime, initialLessons, onComplete }) {
  const [lessons, setLessons] = useState(() => initialLessons?.length ? initialLessons : [emptyLesson()])
  const [submitted, setSubmitted] = useState(false)
  const [minExitDate, setMinExitDate] = useState(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  function updateLesson(idx, field, value) {
    setLessons(ls => ls.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addLesson() {
    setLessons(ls => [...ls, emptyLesson()])
  }

  function removeLesson(idx) {
    setLessons(ls => ls.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setWarning('')

    if (lessons.some(l => !l.type)) {
      setError('授業の種類をすべて選択してください')
      return
    }
    const V = calcV(lessons)
    if (V === 0) {
      setError('授業の内容を入力してください')
      return
    }

    // 滞在時間 vs 報告時間チェック
    const now = new Date()
    let clockInDate = now
    if (clockInTime) {
      const [h, m] = clockInTime.split(':').map(Number)
      clockInDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
    }
    const Y = (now - clockInDate) / 3600000
    const Z = Y - V

    if (Z < -0.25) {
      setError(`報告時間（${Math.round(V * 60)}分）が滞在時間（${Math.round(Y * 60)}分）を超えています。報告内容を修正するか、もう少し時間が経過してから入力してください。`)
      return
    }

    const nextMinExitDate = new Date(clockInDate.getTime() + V * 3600000)
    const minExitStr = nextMinExitDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    if (Z <= 0) {
      setWarning(`⚠️ 授業時間ぴったりです。${minExitStr} 以降に退室できます。`)
    }
    setMinExitDate(nextMinExitDate)

    setSubmitted(true)
    try {
      const clockOutTime = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      await postReport({ staffId: staff.staffId, name: staff.name, date, lessons: buildLessonPayload(lessons), clockInTime, clockOutTime, V })
    } catch {
      setSubmitted(false)
      setMinExitDate(null)
      setError('送信に失敗しました。再度お試しください。')
    }
  }

  if (submitted) {
    const minExitStr = minExitDate?.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
        <div className="text-5xl">✅</div>
        <p className="text-xl font-bold text-gray-800">勤務記録を送信しました</p>
        {minExitStr && (
          <p className="text-amber-600 font-semibold text-sm text-center">🕐 {minExitStr} 以降に退室できます</p>
        )}
        <p className="text-gray-500 text-sm text-center">次は退室打刻をしてください。</p>
        <button onClick={() => onComplete(minExitDate, lessons)} className="w-full py-3 bg-line-green text-white font-bold rounded-xl">
          退室画面へ戻る
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="bg-line-green text-white px-4 py-4">
        <h2 className="text-lg font-bold">勤務記録</h2>
        <p className="text-sm opacity-90">{date}　{staff.name}　{clockInTime && `${clockInTime} 入室`}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {lessons.map((lesson, idx) => (
          <LessonCard key={idx} idx={idx} lesson={lesson}
            onChange={updateLesson} onRemove={removeLesson} />
        ))}

        <button type="button" onClick={addLesson}
          className="w-full py-2 border-2 border-dashed border-line-green text-line-green font-semibold rounded-xl text-sm">
          ＋ 授業を追加
        </button>

        {warning && (
          <div className="rounded-xl p-4 text-sm bg-yellow-50 border border-yellow-300 text-yellow-700">
            {warning}
          </div>
        )}
        {error && (
          <div className="rounded-xl p-4 text-sm bg-red-50 border border-red-300 text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 py-4 border-t border-gray-100 bg-white">
        <button type="submit"
          className="w-full py-4 bg-line-green text-white font-bold rounded-xl text-lg">
          勤務記録を送信する
        </button>
      </div>
    </form>
  )
}
