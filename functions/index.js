const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
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

// ── 勤務記録ログ転記（作成・修正どちらも対応）────────────────────────────────
exports.syncReportToSheets = onDocumentWritten(
  { document: 'reports/{reportId}', region: 'asia-northeast2' },
  async (event) => {
    const after = event.data.after
    if (!after.exists) return  // 削除イベントは無視

    const { staffId, name, date, lessons, clockInTime, clockOutTime, V } = after.data()
    if (!SPREADSHEET_ID) { console.error('SPREADSHEET_ID 未設定'); return }

    const isUpdate = event.data.before.exists
    const sheets = await getSheetsClient()

    // 修正の場合：既存の同じ staffId+date の行を削除
    if (isUpdate) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${RECORD_SHEET}!A:D`,
      })
      const allRows = res.data.values || []
      // 1行目はヘッダーなので index+1 がシートの行番号（1始まり）
      const targetIndices = allRows
        .map((row, i) => ({ row, sheetRow: i + 1 }))
        .filter(({ row }) => row[1] === staffId && row[3] === date)
        .map(({ sheetRow }) => sheetRow)
        .reverse()  // 下から削除して行番号ズレを防ぐ

      for (const sheetRow of targetIndices) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: await getSheetId(sheets, RECORD_SHEET),
                  dimension: 'ROWS',
                  startIndex: sheetRow - 1,
                  endIndex: sheetRow,
                },
              },
            }],
          },
        })
      }
      console.log(`[syncReportToSheets] 修正: ${name} ${date} 既存${targetIndices.length}行削除`)
    }

    // 新しい行を追記
    const rows = (lessons || []).map(lesson => [
      new Date().toISOString(), staffId, name, date,
      lesson.typeLabel || '', lesson.grade    || '', lesson.target || '',
      lesson.amount    || '', lesson.unit     || '',
      clockInTime || '', clockOutTime || '', V || 0,
    ])
    if (rows.length === 0) return

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${RECORD_SHEET}!A:L`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows },
    })
    console.log(`[syncReportToSheets] ${isUpdate ? '修正' : '新規'}: ${name} ${date} ${rows.length}行`)
  }
)

// ── Zエラー → LINE 通知 ──────────────────────────────────────────────────────
exports.syncErrorToLine = onDocumentCreated(
  { document: 'errors/{id}', region: 'asia-northeast2' },
  async (event) => {
    const { staffId, name, date, detail } = event.data.data()
    const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
    if (!LINE_TOKEN) { console.error('LINE_CHANNEL_ACCESS_TOKEN 未設定'); return }

    const db = getFirestore()
    const staffDoc = await db.collection('staffs').doc(staffId).get()
    if (!staffDoc.exists) { console.warn(`staffs/${staffId} が見つかりません`); return }

    const { lineUserId } = staffDoc.data()
    if (!lineUserId) { console.warn(`lineUserId 未設定: ${staffId}`); return }

    const text = `【勤務記録エラー】\n${date} の勤務記録に確認が必要です。\n\n${detail}\n\nアプリを開いて修正してください。\nhttps://liff.line.me/${process.env.LIFF_ID || ''}`

    const res = await fetch('https://api.line.me/v2/bot/messages/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
    })
    console.log(`[syncErrorToLine] ${name} ${date} status=${res.status}`)
  }
)

// シート名からsheetIdを取得
async function getSheetId(sheets, sheetName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const sheet = meta.data.sheets.find(s => s.properties.title === sheetName)
  return sheet.properties.sheetId
}
