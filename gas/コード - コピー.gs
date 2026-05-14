// ============================================================
//  塾講師管理アプリ - GAS Web App
// ============================================================

// シート名
const SHEET = {
  MASTER  : '講師マスタ',
  CLOCK   : '打刻ログ',
  RECORD  : '勤務記録ログ',
  ADMIN   : '管理者',
}

// ============================================================
//  Web App エントリーポイント
// ============================================================

function doGet(e) {
  const action = e.parameter.action

  if (action === 'getStaff') {
    return jsonResponse(getStaffByLineId(e.parameter.lineUserId))
  }
  if (action === 'getHistory') {
    return jsonResponse(getClockHistory(e.parameter.staffId))
  }

  return jsonResponse({ error: '不明なアクション' })
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)
    const action = data.action

    if (action === 'attendance') {
      return jsonResponse(saveAttendance(data))
    }
    if (action === 'report') {
      return jsonResponse(saveReport(data))
    }

    return jsonResponse({ error: '不明なアクション' })
  } catch (err) {
    return jsonResponse({ error: err.message })
  }
}

// ============================================================
//  講師マスタ検索（LINE ID → 講師情報）
// ============================================================

function getStaffByLineId(lineUserId) {
  if (!lineUserId) return null

  const sheet = getSheet(SHEET.MASTER)
  const rows  = sheet.getDataRange().getValues()

  // ヘッダー: [LINE_ID, スタッフID, 氏名, グレード, メール]
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === lineUserId) {
      return {
        lineUserId : rows[i][0],
        staffId    : rows[i][1],
        name       : rows[i][2],
        grade      : rows[i][3],
        email      : rows[i][4],
      }
    }
  }
  return null
}

// ============================================================
//  打刻ログ保存
// ============================================================

function saveAttendance({ staffId, name, type, timestamp, location }) {
  const sheet = getSheet(SHEET.CLOCK)
  const now   = new Date(timestamp)
  const date  = formatDate(now)
  const time  = formatTime(now)
  const lat   = location ? location.lat : ''
  const lng   = location ? location.lng : ''

  // ヘッダー: [タイムスタンプ, スタッフID, 氏名, 打刻種別, 日付, 時刻, 緯度, 経度]
  sheet.appendRow([new Date(), staffId, name, type === 'in' ? '出勤' : '退勤', date, time, lat, lng])

  return { success: true, date, time }
}

// ============================================================
//  勤務記録ログ保存
// ============================================================

function saveReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }) {
  const sheet = getSheet(SHEET.RECORD)

  lessons.forEach(lesson => {
    // ヘッダー: [タイムスタンプ, スタッフID, 氏名, 日付, 授業種類, 学年, 生徒名/クラス名, コマ数/時間, 単位, 入室, 退室, V合計]
    sheet.appendRow([
      new Date(),
      staffId,
      name,
      date,
      lesson.typeLabel,
      lesson.grade   || '',
      lesson.target  || '',
      lesson.amount,
      lesson.unit,
      clockInTime    || '',
      clockOutTime   || '',
      V              || '',
    ])
  })

  return { success: true }
}

// ============================================================
//  打刻履歴取得（今月分）
// ============================================================

function getClockHistory(staffId) {
  const sheet = getSheet(SHEET.CLOCK)
  const rows  = sheet.getDataRange().getValues()
  const today = new Date()
  const ym    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const result = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row[1] === staffId && String(row[4]).startsWith(ym)) {
      result.push({ date: row[4], type: row[3], time: row[5] })
    }
  }
  return result
}

// ============================================================
//  深夜バッチ：各先生シートをまとめて更新 ＋ Z列チェック通知
//  GASトリガーで毎日深夜2時に実行
// ============================================================

function nightlyBatch() {
  const ss         = SpreadsheetApp.getActiveSpreadsheet()
  const clockSheet = getSheet(SHEET.CLOCK)
  const recSheet   = getSheet(SHEET.RECORD)

  const clockRows  = clockSheet.getDataRange().getValues().slice(1)
  const recRows    = recSheet.getDataRange().getValues().slice(1)

  // 今月の〆日範囲（前月21日〜当月20日）
  const today      = new Date()
  const { start, end } = getClosingRange(today)

  // 打刻ログを講師×日付でまとめる
  const clockMap = {}
  clockRows.forEach(row => {
    const [, staffId,, type, date, time] = row
    if (!isInRange(date, start, end)) return
    if (!clockMap[staffId]) clockMap[staffId] = {}
    if (!clockMap[staffId][date]) clockMap[staffId][date] = {}
    clockMap[staffId][date][type === '出勤' ? 'in' : 'out'] = time
  })

  // 勤務記録ログを講師×日付でまとめる（V合計）
  const recMap = {}
  recRows.forEach(row => {
    const [, staffId,, date,,,, amount, unit,,, V] = row
    if (!isInRange(date, start, end)) return
    if (!recMap[staffId]) recMap[staffId] = {}
    if (!recMap[staffId][date]) recMap[staffId][date] = parseFloat(V) || 0
  })

  // 各先生シートを更新
  const masterSheet = getSheet(SHEET.MASTER)
  const masters     = masterSheet.getDataRange().getValues().slice(1)
  const zErrors     = []

  masters.forEach(master => {
    const [lineUserId, staffId, name] = master
    const staffSheet = ss.getSheetByName(name)
    if (!staffSheet) return

    const sheetRows = staffSheet.getDataRange().getValues()

    for (let i = 1; i < sheetRows.length; i++) {
      const date = formatDate(sheetRows[i][1])
      if (!date || !isInRange(date, start, end)) continue

      const clock = clockMap[staffId]?.[date] || {}
      const V     = recMap[staffId]?.[date]   || 0

      const inTime  = clock.in  || ''
      const outTime = clock.out || ''
      const Y       = calcHoursDiff(inTime, outTime)
      const Z       = Y - V

      if (inTime)  staffSheet.getRange(i + 1, 23).setValue(inTime)
      if (outTime) staffSheet.getRange(i + 1, 24).setValue(outTime)
      if (Y > 0)   staffSheet.getRange(i + 1, 25).setValue(Y)
      if (V > 0)   staffSheet.getRange(i + 1, 22).setValue(V)
      staffSheet.getRange(i + 1, 26).setValue(Z || '')

      if (V > 0 && (Z < -0.25 || Z >= 1)) {
        zErrors.push({ name, date, V: V.toFixed(2), Y: Y.toFixed(2), Z: Z.toFixed(2) })
      }
    }
  })

  // Z異常があれば管理者全員にメール通知
  if (zErrors.length > 0) {
    const subject = `【勤務記録チェック】${formatDate(today)} 異常${zErrors.length}件`
    const body    = '以下の勤務記録に差異があります。\n\n' +
      zErrors.map(e =>
        `・${e.name}　${e.date}\n　滞在 ${e.Y}h ／ 記録 ${e.V}h ／ 差 ${e.Z}h`
      ).join('\n') +
      '\n\n必要に応じて担当講師に確認をお願いします。'

    sendAdminMail(subject, body)
  }

  Logger.log(`バッチ完了: ${zErrors.length}件の異常`)
}

// ============================================================
//  管理者メール送信（管理者シートの有効な全員に送信）
// ============================================================

function sendAdminMail(subject, body) {
  const sheet = getSheet(SHEET.ADMIN)
  const rows  = sheet.getDataRange().getValues().slice(1)

  // ヘッダー: [名前, メールアドレス, 有効]
  rows.forEach(row => {
    const name    = row[0]
    const email   = row[1]
    const enabled = row[2]

    if (!email) return
    // 有効列が TRUE / "✓" / "有効" / 空でない文字列 のいずれかなら送信
    if (!enabled) return

    GmailApp.sendEmail(email, subject, body)
    Logger.log(`メール送信: ${name} <${email}>`)
  })
}

// ============================================================
//  ユーティリティ
// ============================================================

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt)) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function formatTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function calcHoursDiff(inStr, outStr) {
  if (!inStr || !outStr) return 0
  const [ih, im] = inStr.split(':').map(Number)
  const [oh, om] = outStr.split(':').map(Number)
  return Math.round(((oh * 60 + om) - (ih * 60 + im)) / 60 * 100) / 100
}

function getClosingRange(today) {
  const year  = today.getFullYear()
  const month = today.getMonth()
  const day   = today.getDate()
  const base  = day >= 21 ? new Date(year, month, 21) : new Date(year, month - 1, 21)
  const end   = new Date(base.getFullYear(), base.getMonth() + 1, 20)
  return { start: formatDate(base), end: formatDate(end) }
}

function isInRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end
}

// ============================================================
//  初回セットアップ：シートを自動生成
//  一度だけ手動実行してください
// ============================================================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  const config = [
    {
      name   : SHEET.MASTER,
      headers: ['LINE_ID', 'スタッフID', '氏名', 'グレード', 'メール'],
      color  : '#4CAF50',
    },
    {
      name   : SHEET.CLOCK,
      headers: ['タイムスタンプ', 'スタッフID', '氏名', '打刻種別', '日付', '時刻', '緯度', '経度'],
      color  : '#4CAF50',
    },
    {
      name   : SHEET.RECORD,
      headers: ['タイムスタンプ', 'スタッフID', '氏名', '日付', '授業種類', '学年', '生徒名/クラス名', 'コマ数/時間', '単位', '入室時刻', '退室時刻', 'V合計(h)'],
      color  : '#4CAF50',
    },
    {
      name   : SHEET.ADMIN,
      headers: ['名前', 'メールアドレス', '有効'],
      color  : '#1565C0',
    },
  ]

  config.forEach(({ name, headers, color }) => {
    let sheet = ss.getSheetByName(name)
    if (!sheet) {
      sheet = ss.insertSheet(name)
      Logger.log(`シート作成: ${name}`)
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers)
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground(color)
        .setFontColor('white')
        .setFontWeight('bold')
    }
  })

  Logger.log('セットアップ完了！')
}
