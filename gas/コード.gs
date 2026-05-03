// ============================================================
//  塾講師管理アプリ - GAS Web App
// ============================================================

// シート名
const SHEET = {
  MASTER  : '講師マスタ',
  CLOCK   : '打刻ログ',
  RECORD  : '勤務記録ログ',
  ADMIN   : '管理者',
  RATE    : 'グレード時給表',
}

// 授業種類×学年 → 講師シート列番号（1始まり）
const COL_MAP = {
  'MM 1:1_小学生'              : 3,   // C
  'MM 1:1_中学生'              : 4,   // D
  'MM 1:1_高校生'              : 5,   // E
  'MM 1:2_小学生'              : 6,   // F
  'MM 1:2_中学生'              : 7,   // G
  'MM 1:2_高校生'              : 8,   // H
  '一斉少人数(1〜8名)_小学生'  : 9,   // I
  '一斉少人数(1〜8名)_中学生'  : 10,  // J
  '一斉少人数(1〜8名)_高校生'  : 11,  // K
  '一斉多人数(9名以上)_小学生' : 12,  // L
  '一斉多人数(9名以上)_中学生' : 13,  // M
  '一斉多人数(9名以上)_高校生' : 14,  // N
  '自立_小学生'                : 15,  // O（小チャレ）
  '自立_中学生'                : 16,  // P
  '自立_高校生'                : 17,  // Q
  '補習 or 事務_'              : 18,  // R
}
const MM_COLS     = [3,4,5,6,7,8]
const NON_MM_COLS = [9,10,11,12,13,14,15,16,17,18]

// 講師シート列番号 → グレード時給表の行ラベル
const RATE_LABEL = {
  3:  'MM(小)1:1',
  4:  'MM(中)1:1',
  5:  'MM(高)1:1',
  6:  'MM(小)1:2',
  7:  'MM(中)1:2',
  8:  'MM(高)1:2',
  9:  '一斉(少)小',
  10: '一斉(少)中',
  11: '一斉(少)高',
  12: '一斉(多)小',
  13: '一斉(多)中',
  14: '一斉(多)高',
  15: '小チャレ',
  16: '自立(中)',
  17: '自立(高)',
  18: '補習・事務',
}

// 講師シート固定列
const DATA_START_ROW = 2    // データ開始行
const DATA_MAX_ROWS  = 31   // 最大31日
const SUM_ROW        = 33   // 合計行
const LABEL_ROW      = 34   // ラベル行（35・36行の見出し）
const RATE_ROW       = 35   // コマ単価行
const CALC_ROW       = 36   // 授業料計算行
const COL_AA         = 27   // AA列 = 交通費

// ============================================================
//  Web App エントリーポイント
// ============================================================

function doGet(e) {
  const action = e.parameter.action
  if (action === 'getStaff')   return jsonResponse(getStaffByLineId(e.parameter.lineUserId))
  if (action === 'getHistory') return jsonResponse(getClockHistory(e.parameter.staffId))
  return jsonResponse({ error: '不明なアクション' })
}

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents)
    const action = data.action
    if (action === 'attendance') return jsonResponse(saveAttendance(data))
    if (action === 'report')     return jsonResponse(saveReport(data))
    return jsonResponse({ error: '不明なアクション' })
  } catch (err) {
    return jsonResponse({ error: err.message })
  }
}

// ============================================================
//  講師マスタ検索（LINE ID → 講師情報 + 通勤手段）
// ============================================================

function getStaffByLineId(lineUserId) {
  if (!lineUserId) return null

  const sheet = getSheet(SHEET.MASTER)
  const rows  = sheet.getDataRange().getValues()

  // ヘッダー: [LINE_ID, スタッフID, 氏名, グレード, メール, チーフ,
  //            通勤手段1, 手当1, 通勤手段2, 手当2, ...]
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === lineUserId) {
      const commutes = []
      if (rows[i][6]) commutes.push({ label: rows[i][6], allowance: rows[i][7] || 0 })
      if (rows[i][8]) commutes.push({ label: rows[i][8], allowance: rows[i][9] || 0 })
      return {
        lineUserId : rows[i][0],
        staffId    : rows[i][1],
        name       : rows[i][2],
        grade      : rows[i][3],
        email      : rows[i][4],
        commutes,
      }
    }
  }
  return null
}

// ============================================================
//  打刻ログ保存
// ============================================================

function saveAttendance({ staffId, name, type, timestamp, location, commuteLabel, commuteAllowance }) {
  const sheet = getSheet(SHEET.CLOCK)
  const now   = new Date(timestamp)
  const date  = formatDate(now)
  const time  = formatTime(now)
  const lat   = location ? location.lat : ''
  const lng   = location ? location.lng : ''

  // ヘッダー: [タイムスタンプ, スタッフID, 氏名, 打刻種別, 日付, 時刻, 緯度, 経度, 通勤手段, 通勤手当]
  sheet.appendRow([
    new Date(), staffId, name,
    type === 'in' ? '出勤' : '退勤',
    date, time, lat, lng,
    commuteLabel || '', commuteAllowance || 0,
  ])

  return { success: true, date, time }
}

// ============================================================
//  勤務記録ログ保存
// ============================================================

function saveReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }) {
  const sheet = getSheet(SHEET.RECORD)
  lessons.forEach(lesson => {
    sheet.appendRow([
      new Date(), staffId, name, date,
      lesson.typeLabel, lesson.grade || '', lesson.target || '',
      lesson.amount, lesson.unit,
      clockInTime || '', clockOutTime || '', V || '',
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
//  深夜バッチ（毎日3〜4時）
//  ① 各先生シートに勤務記録をマッピング（AA列 交通費含む）
//  ② 20日〆の翌日（21日）に月次バックアップ作成 + Excel メール送信
// ============================================================

function nightlyBatch() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const today = new Date()
  const { start, end } = getClosingRange(today)

  // ── 打刻ログ読み込み ──
  const clockRows = getSheet(SHEET.CLOCK).getDataRange().getValues().slice(1)
  const clockMap  = {}  // { staffId: { date: { in, out, commuteLabel, commuteAllowance } } }
  clockRows.forEach(row => {
    const [, staffId,, type, date, time,,, commuteLabel, commuteAllowance] = row
    if (!isInRange(date, start, end)) return
    if (!clockMap[staffId])        clockMap[staffId] = {}
    if (!clockMap[staffId][date])  clockMap[staffId][date] = {}
    if (type === '出勤') {
      clockMap[staffId][date].in               = time
      clockMap[staffId][date].commuteLabel     = commuteLabel    || ''
      clockMap[staffId][date].commuteAllowance = commuteAllowance || 0
    } else {
      clockMap[staffId][date].out = time
    }
  })

  // ── 勤務記録ログ読み込み ──
  const recRows = getSheet(SHEET.RECORD).getDataRange().getValues().slice(1)
  const recMap  = {}   // { staffId: { date: { col: 合計値 } } }
  const vMap    = {}   // { staffId: { date: V合計(h) } }
  recRows.forEach(row => {
    const [, staffId,, date, typeLabel, grade,, amount,,,, V] = row
    if (!isInRange(date, start, end)) return
    if (!recMap[staffId])       recMap[staffId] = {}
    if (!recMap[staffId][date]) recMap[staffId][date] = {}
    if (!vMap[staffId])         vMap[staffId] = {}
    vMap[staffId][date] = parseFloat(V) || 0

    const key = `${typeLabel}_${grade || ''}`
    const col = COL_MAP[key] || COL_MAP[`${typeLabel}_`]
    if (!col) return
    recMap[staffId][date][col] = (recMap[staffId][date][col] || 0) + (parseFloat(amount) || 0)
  })

  // ── 各先生シートを更新 ──
  const masters  = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)
  const zErrors  = []

  masters.forEach(master => {
    const staffId  = master[1]
    const name     = master[2]
    const grade    = master[3]
    const isSocial = (grade === '社員')

    const staffSheet = ss.getSheetByName(name)
    if (!staffSheet) return

    const sheetRows = staffSheet.getDataRange().getValues()

    for (let i = 1; i < sheetRows.length; i++) {
      const dateVal = sheetRows[i][1]   // B列（index 1）
      if (!dateVal) continue
      const date = formatDate(dateVal instanceof Date ? dateVal : new Date(dateVal))
      if (!isInRange(date, start, end)) continue

      const clock  = clockMap[staffId]?.[date] || {}
      const recDay = recMap[staffId]?.[date]   || {}
      const V      = vMap[staffId]?.[date]     || 0

      const inTime  = clock.in  || ''
      const outTime = clock.out || ''
      const Y       = calcHoursDiff(inTime, outTime)  // 時間（小数）
      const Z       = Y - V

      if (!isSocial && Object.keys(recDay).length > 0) {
        // C〜R列（授業コマ数）を書き込み
        Object.entries(recDay).forEach(([col, val]) => {
          staffSheet.getRange(i + 1, parseInt(col)).setValue(val || '')
        })

        // T列（20）: MMコマ数日計
        const tVal = MM_COLS.reduce((s, c) => s + (recDay[c] || 0), 0)
        // U列（21）: MM以外日計
        const uVal = NON_MM_COLS.reduce((s, c) => s + (recDay[c] || 0), 0)
        // V列（22）: (T×80 + U×60) ÷ 60 → 時間（小数）→ Sheets時刻形式（÷24）
        const vCalc = (tVal * 80 + uVal * 60) / 60

        if (tVal > 0) staffSheet.getRange(i + 1, 20).setValue(tVal)
        if (uVal > 0) staffSheet.getRange(i + 1, 21).setValue(uVal)
        if (vCalc > 0) staffSheet.getRange(i + 1, 22).setValue(vCalc / 24)
      }

      // W列（23）入室, X列（24）退室
      if (inTime)  staffSheet.getRange(i + 1, 23).setValue(inTime)
      if (outTime) staffSheet.getRange(i + 1, 24).setValue(outTime)
      // Y列（25）合計時間, Z列（26）時間差
      if (Y > 0)   staffSheet.getRange(i + 1, 25).setValue(Y / 24)
      staffSheet.getRange(i + 1, 26).setValue(Z !== 0 ? Z / 24 : '')
      // AA列（27）交通費 ← 追加
      const commuteAmt = clock.commuteAllowance || 0
      if (commuteAmt) staffSheet.getRange(i + 1, COL_AA).setValue(commuteAmt)

      // Z異常チェック（V>0 かつ Z<-0.25 または Z>=1）
      if (V > 0 && (Z < -0.25 || Z >= 1)) {
        zErrors.push({ name, date, V: V.toFixed(2), Y: Y.toFixed(2), Z: Z.toFixed(2) })
      }
    }
  })

  // ── 21日は月次バックアップ ──
  if (today.getDate() === 21) {
    monthlyBackup(ss, masters, end)
  }

  // ── Z異常メール通知 ──
  if (zErrors.length > 0) {
    const subject = `【勤務記録チェック】${formatDate(today)} 異常${zErrors.length}件`
    const body = '以下の勤務記録に差異があります。\n\n' +
      zErrors.map(e =>
        `・${e.name}　${e.date}\n　滞在 ${e.Y}h ／ 記録 ${e.V}h ／ 差 ${e.Z}h`
      ).join('\n') +
      '\n\n必要に応じて担当講師に確認をお願いします。'
    sendAdminMail(subject, body)
  }

  Logger.log(`バッチ完了: ${zErrors.length}件の異常`)
}

// ============================================================
//  月次バックアップ（毎月21日）
//  ① 新規スプレッドシートをバックアップフォルダに作成
//  ② Excelに変換して本社にメール送信
// ============================================================

function monthlyBackup(ss, masters, endDate) {
  const dt      = endDate instanceof Date ? endDate : new Date(endDate)
  const year    = dt.getFullYear()
  const month   = dt.getMonth() + 1
  const label   = `${year}年${month}月分`
  const fileName = `アルバイト明細_${label}`

  // バックアップフォルダを取得または作成
  const parentFolder = DriveApp.getFileById(ss.getId()).getParents().next()
  let backupFolder
  const folders = parentFolder.getFoldersByName('バックアップ')
  if (folders.hasNext()) {
    backupFolder = folders.next()
  } else {
    backupFolder = parentFolder.createFolder('バックアップ')
  }

  // 既存バックアップチェック
  const existing = backupFolder.getFilesByName(fileName)
  if (existing.hasNext()) {
    Logger.log(`バックアップ済み: ${fileName}`)
    return
  }

  // 現在のスプレッドシートをコピー
  const original   = DriveApp.getFileById(ss.getId())
  const backupFile = original.makeCopy(fileName, backupFolder)
  Logger.log(`バックアップ作成: ${fileName}`)

  // Excelに変換してメール送信
  const url      = `https://docs.google.com/spreadsheets/d/${backupFile.getId()}/export?format=xlsx`
  const token    = ScriptApp.getOAuthToken()
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const xlsxBlob = response.getBlob().setName(`${fileName}.xlsx`)

  // 本社メールアドレスを管理者シートから取得
  const adminSheet = getSheet(SHEET.ADMIN)
  const adminRows  = adminSheet.getDataRange().getValues().slice(1)
  const honsha     = adminRows.filter(r => r[2] === true || r[2] === '✓' || r[2] === '本社')

  honsha.forEach(row => {
    const email = row[1]
    if (!email) return
    GmailApp.sendEmail(
      email,
      `【${label}】アルバイト明細`,
      `${label}のアルバイト明細をお送りします。\n\nご確認をよろしくお願いいたします。`,
      { attachments: [xlsxBlob] }
    )
    Logger.log(`Excel送信: ${email}`)
  })
}

// ============================================================
//  月次更新（バックアップ確認後、手動実行）
//  ① 打刻ログ・勤務記録ログをクリア
//  ② 各講師シートをテンプレートから再生成（または更新）
// ============================================================

function monthlyUpdate() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const today = new Date()

  // ── テンプレートシートの確認 ──
  const templateSheet = ss.getSheetByName('テンプレート')
  if (!templateSheet) {
    SpreadsheetApp.getUi().alert(
      '「テンプレート」シートが見つかりません！\n' +
      'シート名を「テンプレート」にして再実行してください。'
    )
    return
  }

  // ── 新しい期間を計算（実行日≧21日なら「今月21日〜来月20日」）──
  let periodStart, periodEnd
  if (today.getDate() >= 21) {
    periodStart = new Date(today.getFullYear(), today.getMonth(), 21)
    periodEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 20)
  } else {
    periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 21)
    periodEnd   = new Date(today.getFullYear(), today.getMonth(), 20)
  }

  // 期間の日数を計算（月によって28〜31日）
  const dayCount   = Math.round((periodEnd - periodStart) / 86400000) + 1
  const startLabel = Utilities.formatDate(periodStart, 'Asia/Tokyo', 'M/d')
  const endLabel   = Utilities.formatDate(periodEnd,   'Asia/Tokyo', 'M/d')

  // ── 1. 打刻ログをクリア（ヘッダー残し）──
  const clockLog = getSheet(SHEET.CLOCK)
  if (clockLog.getLastRow() > 1) {
    clockLog.deleteRows(2, clockLog.getLastRow() - 1)
  }

  // ── 2. 勤務記録ログをクリア（ヘッダー残し）──
  const workLog = getSheet(SHEET.RECORD)
  if (workLog.getLastRow() > 1) {
    workLog.deleteRows(2, workLog.getLastRow() - 1)
  }

  // ── 3. グレード時給表を読み込み ──
  const rateSheet   = getSheet(SHEET.RATE)
  const rateData    = rateSheet.getDataRange().getValues()
  // 1行目: ['※1コマ80分', '研修', 'B1', 'B2', ..., 'A12']
  const rateHeaders = rateData[0]

  // ── 4. 講師マスタから全スタッフを取得してシートをリセット ──
  const masterRows = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)
  let updated = 0

  masterRows.forEach(master => {
    const name  = master[2]
    const grade = master[3]

    if (!name) return

    let staffSheet = ss.getSheetByName(name)
    if (!staffSheet) {
      // テンプレートをコピーして新規作成
      staffSheet = templateSheet.copyTo(ss)
      staffSheet.setName(name)
      Logger.log(`テンプレートからシート作成: ${name}`)
    }

    fillStaffSheet(staffSheet, name, grade, periodStart, dayCount, rateData, rateHeaders)
    updated++
  })

  SpreadsheetApp.getUi().alert(
    `月次更新が完了しました！\n\n` +
    `期間: ${startLabel} 〜 ${endLabel}（${dayCount}日間）\n` +
    `更新シート: ${updated}件\n\n` +
    `打刻ログ・勤務記録ログをクリアしました。`
  )
  Logger.log(`月次更新完了: ${startLabel}〜${endLabel} / ${updated}件`)
}

// ============================================================
//  講師シートにデータを書き込み（構造・数式はテンプレートから引き継ぎ）
//  GASが書くのは：氏名・グレード・日付・コマ単価・チーフ手当 のみ
// ============================================================

function fillStaffSheet(sheet, staffName, grade, periodStart, dayCount, rateData, rateHeaders) {

  // ── データ行をクリア（C〜R授業コマ数、T〜Z日次計算、AA交通費）──
  sheet.getRange(DATA_START_ROW, 3,  DATA_MAX_ROWS, 16).clearContent() // C-R
  sheet.getRange(DATA_START_ROW, 20, DATA_MAX_ROWS, 7).clearContent()  // T-Z
  sheet.getRange(DATA_START_ROW, COL_AA, DATA_MAX_ROWS, 1).clearContent() // AA
  // コマ単価行（35行目）をクリア
  sheet.getRange(RATE_ROW, 3, 1, 16).clearContent()  // C35:R35

  // ── スタッフ情報（A2, A4）──
  sheet.getRange('A2').setValue(staffName)
  sheet.getRange('A4').setValue(grade)

  // ── B列：日付（期間分だけ書き込み、残りは空欄）──
  const dateValues = []
  for (let d = 0; d < DATA_MAX_ROWS; d++) {
    if (d < dayCount) {
      dateValues.push([new Date(periodStart.getTime() + d * 86400000)])
    } else {
      dateValues.push([''])
    }
  }
  const dateRange = sheet.getRange(DATA_START_ROW, 2, DATA_MAX_ROWS, 1)
  dateRange.setValues(dateValues)
  dateRange.setNumberFormat('M/d(ddd)')

  // ── 35行目：コマ単価（グレード時給表から転記）──
  const gradeColIdx = rateHeaders.indexOf(grade)  // 0始まりのインデックス
  if (gradeColIdx < 0) {
    Logger.log(`グレード "${grade}" が時給表に見つかりません（${staffName}）`)
  } else {
    Object.entries(RATE_LABEL).forEach(([staffColStr, rateLabel]) => {
      const staffCol   = parseInt(staffColStr)
      const rateRowIdx = rateData.findIndex(r => r[0] === rateLabel)
      if (rateRowIdx < 0) {
        Logger.log(`時給表に行なし: "${rateLabel}"`)
        return
      }
      const rate = rateData[rateRowIdx][gradeColIdx]
      if (rate) sheet.getRange(RATE_ROW, staffCol).setValue(rate)
    })
  }

  // W36（チーフ手当）・X36（合計支給額）はテンプレートの数式で自動計算
  // ※ W36 = VLOOKUP(A2,講師マスタ!C:F,4,FALSE)*2000
  // ※ X36 = T36+U36+W36
}

// ============================================================
//  管理者メール送信
// ============================================================

function sendAdminMail(subject, body) {
  const sheet = getSheet(SHEET.ADMIN)
  const rows  = sheet.getDataRange().getValues().slice(1)
  rows.forEach(row => {
    const email   = row[1]
    const enabled = row[2]
    if (!email || !enabled) return
    GmailApp.sendEmail(email, subject, body)
    Logger.log(`メール送信: ${email}`)
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

// 列番号（1始まり）→ アルファベット変換（例: 27 → "AA"）
function columnToLetter(col) {
  let letter = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    col    = Math.floor((col - 1) / 26)
  }
  return letter
}

// ============================================================
//  初回セットアップ（一度だけ実行）
// ============================================================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const config = [
    {
      name   : SHEET.MASTER,
      headers: ['LINE_ID', 'スタッフID', '氏名', 'グレード', 'メール', 'チーフ',
                '通勤手段1', '手当1', '通勤手段2', '手当2'],
      color  : '#4CAF50',
    },
    {
      name   : SHEET.CLOCK,
      headers: ['タイムスタンプ', 'スタッフID', '氏名', '打刻種別', '日付', '時刻',
                '緯度', '経度', '通勤手段', '通勤手当'],
      color  : '#4CAF50',
    },
    {
      name   : SHEET.RECORD,
      headers: ['タイムスタンプ', 'スタッフID', '氏名', '日付', '授業種類', '学年',
                '生徒名/クラス名', 'コマ数/時間', '単位', '入室時刻', '退室時刻', 'V合計(h)'],
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
        .setBackground(color).setFontColor('white').setFontWeight('bold')
    }
  })

  Logger.log('セットアップ完了！')
}
