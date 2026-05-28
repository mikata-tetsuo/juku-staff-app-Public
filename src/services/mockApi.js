import { writeAttendance, writeReport, writeSession } from './firestoreService'
import { sbWriteAttendance, sbWriteReport, sbWriteSession } from './supabaseService'

const GAS_URL  = import.meta.env.VITE_GAS_URL
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// ─── 講師マスタ：LINE ID → 講師情報 ────────────────────────────────────────

export async function fetchStaffByLineId(lineUserId) {
  if (DEV_MODE) {
    await delay(400)
    const mock = {
      'U_dev_mock_001': { staffId: 'S001', name: '田中 花子', grade: 'B3', email: 'hanako@example.com', subjects: ['数学', '英語', '物理'], commutes: [{ label: '自転車', allowance: 0 }, { label: '電車', allowance: 200 }] },
    }
    return mock[lineUserId] || null
  }

  const res = await gasGet({ action: 'getStaff', lineUserId })
  return res
}

// ─── 打刻 ────────────────────────────────────────────────────────────────────

export async function postAttendance({ staffId, name, type, timestamp, location, commuteLabel = '', commuteAllowance = 0, reason = '' }) {
  if (DEV_MODE) {
    await delay(500)
    console.log('[mock] 打刻:', { staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason })
    writeAttendance({ staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason }).catch(err =>
      console.error('[Firestore] 打刻書き込み失敗:', err)
    )
    const d = new Date(timestamp)
    return { success: true, date: fmtDate(d), time: fmtTime(d) }
  }

  writeAttendance({ staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason }).catch(err =>
    console.error('[Firestore] 打刻書き込み失敗:', err)
  )
  sbWriteAttendance({ staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason }).catch(err =>
    console.error('[Supabase] 打刻書き込み失敗:', err)
  )
  return { success: true }
}

// ─── 勤務記録 ────────────────────────────────────────────────────────────────

export async function postReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }) {
  if (DEV_MODE) {
    await delay(600)
    console.log('[mock] 勤務記録:', { staffId, name, date, lessons, V })
    return { success: true }
  }

  const today = new Date()
  const [h, m] = (clockInTime || '0:0').split(':').map(Number)
  const clockInDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m)
  const minExitDate = new Date(clockInDate.getTime() + V * 3600000)

  // Firestore に書き込む（Cloud Function が勤務記録ログに転記）
  await writeReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V })
  writeSession(staffId, date, minExitDate).catch(err =>
    console.error('[Firestore] session書き込み失敗:', err)
  )
  sbWriteReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }).catch(err =>
    console.error('[Supabase] 勤務記録書き込み失敗:', err)
  )
  sbWriteSession(staffId, date, minExitDate).catch(err =>
    console.error('[Supabase] session書き込み失敗:', err)
  )

  return { success: true }
}

// ─── お知らせ＋タスク ────────────────────────────────────────────────────────

export async function fetchItems(staffId) {
  if (DEV_MODE) {
    await delay(400)
    return [
      { itemId: 'N001', type: 'お知らせ', text: '5月の出勤日程を確認してください。', date: '5/1', dueDate: '', confirmed: false, completed: false },
      { itemId: 'N002', type: 'お知らせ', text: 'GW期間の対応についてはグループLINEを確認してください。', date: '4/28', dueDate: '', confirmed: true, completed: false },
      { itemId: 'T001', type: 'タスク', text: '5月のシフト希望を提出してください', date: '5/1', dueDate: '5/15', confirmed: false, completed: false },
      { itemId: 'T002', type: 'タスク', text: '健康診断の予約をしてください', date: '4/25', dueDate: '5/31', confirmed: true, completed: false },
    ]
  }
  const data = await gasGet({ action: 'getItems', staffId })
  return data?.items || []
}

export async function updateItemStatus(staffId, itemId, field, value) {
  if (DEV_MODE) {
    console.log('[mock] item update:', itemId, field, value)
    return { success: true }
  }
  gasPost({ action: 'updateItemStatus', staffId, itemId, field, value })
  return { success: true }
}

// ─── 登録申請 ────────────────────────────────────────────────────────────────

export async function postRegistration({ lineUserId, name }) {
  if (DEV_MODE) {
    await delay(500)
    console.log('[mock] 登録申請:', lineUserId, name)
    return { success: true }
  }
  await gasPost({ action: 'requestRegistration', lineUserId, name })
  return { success: true }
}

// ─── マニュアル ──────────────────────────────────────────────────────────────

export async function fetchManual(staffId) {
  if (DEV_MODE) {
    await delay(400)
    return { items: [
      { category: '📋 業務フロー', title: '業務フロー全体（入室→退室）', url: '', order: 1, desc: '' },
      { category: '📋 業務フロー', title: '打刻・勤務記録の付け方', url: 'https://docs.google.com/', order: 2, desc: '' },
      { category: '📋 業務フロー', title: 'アプリを楽に開く方法', url: 'internal:shortcut-guide', order: 4, desc: 'お気に入り登録／ホーム画面ショートカット' },
      { category: '💰 給与・規則', title: '給与・締め日について', url: '', order: 10, desc: '' },
      { category: '💰 給与・規則', title: 'グレード時給表', url: 'internal:rate-table', order: 12, desc: '自分のグレード列を緑でハイライト' },
      { category: '📅 シフト', title: 'シフトのルール', url: '', order: 20, desc: '' },
      { category: '🚨 困った時', title: '体調不良・遅刻時の対応', url: '', order: 30, desc: '' },
    ]}
  }
  const data = await gasGet({ action: 'getManual', staffId })
  return data || { items: [] }
}

export async function fetchRateTable(staffId) {
  if (DEV_MODE) {
    await delay(400)
    return {
      headers: ['※1コマ80分', '研修', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'A1', 'A2'],
      rows: [
        { label: 'MM(小)1:1',  values: [1488, 1488, 1518, 1548, 1578, 1608, 1638, 1908, 1938] },
        { label: 'MM(小)1:2',  values: [1488, 1628, 1658, 1688, 1718, 1748, 1778, 2078, 2108] },
        { label: 'MM(中)1:1',  values: [1488, 1628, 1658, 1688, 1718, 1748, 1778, 2078, 2108] },
        { label: 'MM(中)1:2',  values: [1488, 1758, 1788, 1818, 1848, 1878, 1908, 2208, 2238] },
        { label: 'MM(高)1:1',  values: [1488, 1888, 1918, 1948, 1978, 2008, 2038, 2338, 2368] },
        { label: 'MM(高)1:2',  values: [1488, 2158, 2188, 2218, 2248, 2278, 2308, 2608, 2638] },
        { label: '一斉(少)小', values: [1116, 1316, 1346, 1376, 1406, 1436, 1466, 1736, 1766] },
        { label: '一斉(多)小', values: [1116, 1416, 1446, 1476, 1506, 1536, 1566, 1836, 1866] },
        { label: '一斉(少)中', values: [1116, 1416, 1446, 1476, 1506, 1536, 1566, 1836, 1866] },
        { label: '一斉(多)中', values: [1116, 1516, 1546, 1576, 1606, 1636, 1666, 1936, 1966] },
        { label: '一斉(少)高', values: [1116, 1816, 1846, 1876, 1906, 1936, 1966, 2236, 2266] },
        { label: '一斉(多)高', values: [1116, 2016, 2046, 2076, 2106, 2136, 2166, 2436, 2466] },
        { label: '小チャレ',   values: [1116, 1216, 1246, 1276, 1306, 1336, 1366, 1636, 1666] },
        { label: '自立(中)',   values: [1116, 1366, 1396, 1426, 1456, 1486, 1516, 1786, 1816] },
        { label: '自立(高)',   values: [1116, 1716, 1746, 1776, 1806, 1836, 1866, 2136, 2166] },
        { label: '補習・事務', values: [1116, 1116, 1116, 1116, 1116, 1116, 1116, 1116, 1116] },
      ],
      myGrade: 'B3',
    }
  }
  const data = await gasGet({ action: 'getRateTable', staffId })
  return data || {}
}

// ─── 打刻履歴・給与履歴 ──────────────────────────────────────────────────────

export async function fetchWorkHistory(staffId) {
  if (DEV_MODE) {
    await delay(400)
    const m = new Date().getMonth() + 1
    return {
      period: `${m}月の記録（21日〆）`,
      records: [
        { date: `${m}/2`,  clockIn: '15:00', clockOut: '19:30', lessons: 'MM 1:1 中学生×2コマ、自立×1h',          total: '2.67h' },
        { date: `${m}/5`,  clockIn: '14:00', clockOut: '20:00', lessons: '一斉少人数 高校生×2h、補習×0.25h',     total: '2.25h' },
      ],
    }
  }
  const data = await gasGet({ action: 'getHistory', staffId })
  return data || { period: '', records: [] }
}

export async function fetchPayrollHistory(staffId) {
  if (DEV_MODE) {
    await delay(400)
    return {
      records: [
        { start: '2026/1/21', end: '2026/2/20',   lesson: 19800, transport: 0, chief: 0, total: 19800, days: 9 },
        { start: '2025/12/21', end: '2026/1/20',  lesson: 22000, transport: 0, chief: 0, total: 22000, days: 10 },
        { start: '2025/11/21', end: '2025/12/20', lesson: 18500, transport: 0, chief: 0, total: 18500, days: 8 },
      ],
    }
  }
  const data = await gasGet({ action: 'getPayrollHistory', staffId })
  return data || { records: [] }
}

export async function fetchCurrentPayroll(staffId) {
  if (DEV_MODE) {
    await delay(400)
    const yesterday = new Date(Date.now() - 86400000)
    return {
      period: { start: '4/21', end: '5/20' },
      asOf: `${yesterday.getMonth() + 1}/${yesterday.getDate()}`,
      lesson: 8800, transport: 0, chief: 0, total: 8800, days: 4,
    }
  }
  const data = await gasGet({ action: 'getCurrentPayroll', staffId })
  return data?.error ? null : data
}

// ─── GAS通信ヘルパー ─────────────────────────────────────────────────────────

async function gasGet(params) {
  const query = new URLSearchParams(params).toString()
  const res   = await fetch(`${GAS_URL}?${query}`)
  return res.json()
}

async function gasPost(body) {
  // GAS web appはCORSのためno-corsモードで送信（fire & forget）
  await fetch(GAS_URL, {
    method : 'POST',
    mode   : 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(body),
  })
  return { success: true }
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
