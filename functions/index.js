const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { google } = require('googleapis')

initializeApp()

const SPREADSHEET_ID = process.env.SPREADSHEET_ID
const CLOCK_SHEET  = '打刻ログ'
const RECORD_SHEET = '勤務記録ログ'

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ISO 文字列 → JST の { date: 'YYYY-MM-DD', time: 'HH:MM' }
function toJST(isoStr) {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  const pad = n => String(n).padStart(2, '0')
  return {
    date: `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`,
    time: `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`,
  }
}

// ── 打刻ログ転記 ─────────────────────────────────────────────────────────────
exports.syncAttendanceToSheets = onDocumentCreated(
  { document: 'attendance/{id}', region: 'asia-northeast2' },
  async (event) => {
    const { staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason } = event.data.data()
    if (!SPREADSHEET_ID) { console.error('SPREADSHEET_ID 未設定'); return }

    const { date, time } = toJST(timestamp)
    const lat       = location?.lat ?? ''
    const lng       = location?.lng ?? ''
    const typeLabel = type === 'in' ? '出勤' : '退勤'

    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CLOCK_SHEET}!A:K`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[
        new Date().toISOString(), staffId, name, typeLabel,
        date, time, lat, lng,
        commuteLabel || '', commuteAllowance || 0, reason || '',
      ]] },
    })
    console.log(`[syncAttendanceToSheets] ${name} ${typeLabel} ${date} ${time}`)
  }
)

// ── 勤務記録ログ転記 ─────────────────────────────────────────────────────────
exports.syncReportToSheets = onDocumentCreated(
  { document: 'reports/{reportId}', region: 'asia-northeast2' },
  async (event) => {
    const { staffId, name, date, lessons, clockInTime, clockOutTime, V } = event.data.data()
    if (!SPREADSHEET_ID) { console.error('SPREADSHEET_ID 未設定'); return }

    const rows = (lessons || []).map(lesson => [
      new Date().toISOString(), staffId, name, date,
      lesson.typeLabel || '', lesson.grade    || '', lesson.target || '',
      lesson.amount    || '', lesson.unit     || '',
      clockInTime || '', clockOutTime || '', V || 0,
    ])
    if (rows.length === 0) return

    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${RECORD_SHEET}!A:L`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows },
    })
    console.log(`[syncReportToSheets] ${name} ${date} ${rows.length}行`)
  }
)
