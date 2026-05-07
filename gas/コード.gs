// ============================================================
//  塾講師管理アプリ - GAS Web App
// ============================================================

// ============================================================
//  カスタムメニュー（スプレッドシートを開いたとき自動生成）
// ============================================================

// ============================================================
//  onEdit トリガー：お知らせシートで type を選ぶと itemId を自動採番
//  ・お知らせ → N001, N002, ...
//  ・タスク   → T001, T002, ...
//  ※ A列に既に値があれば上書きしない（手動入力を尊重）
// ============================================================

function onEdit(e) {
  if (!e || !e.range) return
  const sheet = e.range.getSheet()
  if (sheet.getName() !== 'お知らせ') return

  const startRow = e.range.getRow()
  const startCol = e.range.getColumn()
  const numRows  = e.range.getNumRows()
  const numCols  = e.range.getNumColumns()

  // B列（type）が編集範囲に含まれていなければ無視
  if (startCol > 2 || startCol + numCols <= 2) return

  for (let i = 0; i < numRows; i++) {
    const row = startRow + i
    if (row === 1) continue  // ヘッダー除外

    const type = sheet.getRange(row, 2).getValue()
    if (!type) continue

    const itemIdCell = sheet.getRange(row, 1)
    if (itemIdCell.getValue()) continue  // 既に値あり → スキップ

    let prefix
    if (type === 'お知らせ')      prefix = 'N'
    else if (type === 'タスク')   prefix = 'T'
    else continue  // 未対応 type

    // 既存 itemId のうち同 prefix の最大番号を取得
    const lastRow = sheet.getLastRow()
    const ids = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
      : []
    const maxNum = ids
      .filter(v => typeof v === 'string' && v.startsWith(prefix))
      .reduce((max, id) => {
        const num = parseInt(id.slice(1), 10)
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)

    const nextId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`
    itemIdCell.setValue(nextId)
  }
}

function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('🏫 塾管理', [
    { name: '🔄 修正バッチ実行（Z異常を再チェック）', functionName: 'runFixBatch' },
    null,
    { name: '📅 月次更新（手動）',                    functionName: 'monthlyUpdate' },
    { name: '🛡 テンプレート保護設定',                functionName: 'protectTemplateFormulas' },
    null,
    { name: '📊 タスク確認状況を更新',                functionName: 'updateTaskDashboard' },
    { name: '📋 お知らせ集計列を設定',                functionName: 'setupNoticeAggregation' },
    { name: '🆔 登録申請を承認',                      functionName: 'approveRegistrations' },
    null,
    { name: '🔔 22:30リマインドトリガー設定',         functionName: 'setupEveningReminderTrigger' },
    { name: '🔑 LINEトークン登録',                    functionName: 'promptLineChannelToken' },
  ])
}

// 修正バッチ：nightlyBatch を手動実行 + 完了ダイアログ
function runFixBatch() {
  const ui = SpreadsheetApp.getUi()
  const res = ui.alert(
    '🔄 修正バッチ実行',
    '打刻ログを再チェックして\nZ異常ハイライト・講師シート・総支給額を更新します。\n\n実行しますか？',
    ui.ButtonSet.OK_CANCEL
  )
  if (res !== ui.Button.OK) return

  nightlyBatch()

  ui.alert('✅ 完了', '修正バッチが完了しました！\nZ異常が解消されていればハイライトが消えています。', ui.ButtonSet.OK)
}

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
  if (action === 'getStaff')          return jsonResponse(getStaffByLineId(e.parameter.lineUserId))
  if (action === 'getHistory')        return jsonResponse(getHistory(e.parameter.staffId))
  if (action === 'getNotices')        return jsonResponse(getNotices())
  if (action === 'getPayrollHistory') return jsonResponse(getPayrollHistory(e.parameter.staffId))
  if (action === 'getCurrentPayroll') return jsonResponse(getCurrentPayroll(e.parameter.staffId))
  if (action === 'getItems')          return jsonResponse(getItems(e.parameter.staffId))
  if (action === 'getManual')         return jsonResponse(getManual())
  if (action === 'getRateTable')      return jsonResponse(getRateTable(e.parameter.staffId))
  return jsonResponse({ error: '不明なアクション' })
}

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents)
    const action = data.action
    if (action === 'attendance')         return jsonResponse(saveAttendance(data))
    if (action === 'report')             return jsonResponse(saveReport(data))
    if (action === 'updateItemStatus')   return jsonResponse(updateItemStatus(data))
    if (action === 'requestRegistration') return jsonResponse(saveRegistrationRequest(data))
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
//  給与履歴取得（給与履歴シートから）
// ============================================================

function getPayrollHistory(staffId) {
  if (!staffId) return { records: [] }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('給与履歴')
  if (!sheet) return { records: [] }

  const rows = sheet.getDataRange().getValues().slice(1)
  const fmt  = v => v instanceof Date
    ? `${v.getFullYear()}/${v.getMonth()+1}/${v.getDate()}`
    : String(v)

  const records = rows
    .filter(row => String(row[2]) === String(staffId))
    .map(row => ({
      start    : fmt(row[0]),
      end      : fmt(row[1]),
      lesson   : row[5] || 0,
      transport: row[6] || 0,
      chief    : row[7] || 0,
      total    : row[8] || 0,
      days     : row[9] || 0,
    }))
    .reverse()   // 新しい順
    .slice(0, 12) // 最大12ヶ月

  return { records }
}

// ============================================================
//  現在の締め期間の暫定給与（講師シート T36/U36/V36/W36/X36 を直読み）
// ============================================================

function getCurrentPayroll(staffId) {
  if (!staffId) return null

  const masters = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)
  const master  = masters.find(r => String(r[1]) === String(staffId))
  if (!master) return null
  const name = master[2]
  if (!name) return null

  const ss          = SpreadsheetApp.getActiveSpreadsheet()
  const staffSheet  = ss.getSheetByName(name)
  const today       = new Date()
  const { start, end } = getClosingRange(today)
  const period      = { start: ymdToMd(start), end: ymdToMd(end) }
  // 集計バッチは深夜3-4時に走るので、表示時点で確定しているのは「前日まで」
  const asOfDate    = new Date(today.getTime() - 86400000)
  const asOf        = `${asOfDate.getMonth() + 1}/${asOfDate.getDate()}`

  if (!staffSheet) {
    return { period, asOf, lesson: 0, transport: 0, chief: 0, total: 0, days: 0 }
  }

  const lesson    = Number(staffSheet.getRange(CALC_ROW, 20).getValue()) || 0  // T36 授業料
  const transport = Number(staffSheet.getRange(CALC_ROW, 21).getValue()) || 0  // U36 交通費
  const days      = Number(staffSheet.getRange(CALC_ROW, 22).getValue()) || 0  // V36 出勤数
  const chief     = Number(staffSheet.getRange(CALC_ROW, 23).getValue()) || 0  // W36 チーフ手当
  const total     = Number(staffSheet.getRange(CALC_ROW, 24).getValue()) || 0  // X36 合計支給額

  return { period, asOf, lesson, transport, chief, total, days }
}

// 'YYYY-MM-DD' → 'M/d'
function ymdToMd(s) {
  const m = String(s).match(/^\d{4}-(\d{2})-(\d{2})$/)
  return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : String(s)
}

// ============================================================
//  お知らせシートに集計列（確認済/未確認/完了済/未完了 の人数）を追加
//  メニュー「📋 お知らせ集計列を設定」から実行
// ============================================================

function setupNoticeAggregation() {
  const ui = SpreadsheetApp.getUi()
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName('お知らせ')
  if (!sheet) {
    ui.alert('「お知らせ」シートが見つかりません')
    return
  }

  // ヘッダー判定
  const lastCol = Math.max(sheet.getLastColumn(), 6)
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim())
  const isLegacy = headers.indexOf('text') === -1

  if (isLegacy) {
    ui.alert(
      '⚠️ お知らせシートが旧スキーマのままです',
      '集計列を追加するには、まず以下の手順で新スキーマに移行してください:\n\n' +
      '1. A列とB列を挿入\n' +
      '2. ヘッダー行を「itemId | type | text | date | dueDate | expiry」に書き換え\n' +
      '3. 既存データの itemId（例: N001）と type（お知らせ）を入力\n\n' +
      '移行後、再度このメニューを実行してください。',
      ui.ButtonSet.OK
    )
    return
  }

  // 集計列のヘッダー（G〜J列）
  sheet.getRange(1, 7, 1, 4).setValues([['確認済', '未確認', '完了済', '未完了']])
  sheet.getRange(1, 7, 1, 4)
    .setBackground('#1565C0').setFontColor('white').setFontWeight('bold')

  const lastRow = sheet.getLastRow()
  if (lastRow >= 2) {
    const formulas = []
    for (let row = 2; row <= lastRow; row++) {
      formulas.push([
        `=IFERROR(COUNTIFS('お知らせ状態'!B:B, A${row}, 'お知らせ状態'!C:C, TRUE), 0)`,
        `=COUNTA('講師マスタ'!C2:C) - G${row}`,
        `=IF(B${row}="タスク", IFERROR(COUNTIFS('お知らせ状態'!B:B, A${row}, 'お知らせ状態'!D:D, TRUE), 0), "-")`,
        `=IF(B${row}="タスク", COUNTA('講師マスタ'!C2:C) - I${row}, "-")`,
      ])
    }
    sheet.getRange(2, 7, formulas.length, 4).setFormulas(formulas)
  }

  ui.alert('✅ 完了', '集計列（確認済/未確認/完了済/未完了）を追加しました。\n人数は自動更新されます。', ui.ButtonSet.OK)
}

// ============================================================
//  タスク確認状況ダッシュボード（誰が何をやったか一覧）
//  メニュー「📊 タスク確認状況を更新」から実行
//  シート「タスク確認状況」を再生成: 行=お知らせ/タスク、列=講師
// ============================================================

function updateTaskDashboard() {
  // メニューから呼ばれた場合のみUI、バッチからの場合はnull
  let ui = null
  try { ui = SpreadsheetApp.getUi() } catch (e) {}

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const masterSheet = ss.getSheetByName('講師マスタ')
  const itemsSheet  = ss.getSheetByName('お知らせ')

  if (!masterSheet || !itemsSheet) {
    if (ui) ui.alert('「講師マスタ」または「お知らせ」シートが見つかりません')
    Logger.log('updateTaskDashboard: シートが見つかりません')
    return
  }

  // 講師リスト（氏名のあるもののみ）
  const masters = masterSheet.getDataRange().getValues().slice(1)
  const teachers = masters
    .filter(r => r[1] && r[2])
    .map(r => ({ staffId: String(r[1]), name: String(r[2]) }))

  if (teachers.length === 0) {
    if (ui) ui.alert('講師マスタに講師が登録されていません')
    Logger.log('updateTaskDashboard: 講師なし')
    return
  }

  // アイテム取得（旧/新スキーマ両対応）
  const itemsData = itemsSheet.getDataRange().getValues()
  if (itemsData.length < 2) {
    if (ui) ui.alert('お知らせシートにデータがありません')
    Logger.log('updateTaskDashboard: データなし')
    return
  }
  const itemHeader = itemsData[0].map(h => String(h || '').trim())
  const idx = name => itemHeader.indexOf(name)
  const iItem = idx('itemId')
  const iType = idx('type')
  const iText = idx('text')
  const isLegacy = iText === -1

  const items = itemsData.slice(1).map((row, i) => {
    if (isLegacy) {
      return { itemId: `legacy-${i}`, type: 'お知らせ', text: String(row[1] || '') }
    }
    return {
      itemId: row[iItem] ? String(row[iItem]) : `legacy-${i}`,
      type  : String(row[iType] || '').trim() || 'お知らせ',
      text  : String(row[iText] || ''),
    }
  }).filter(item => item.text)

  // 状態シート読み込み
  const stateSheet = ss.getSheetByName('お知らせ状態')
  const stateMap = {}  // { staffId: { itemId: {confirmed, completed} } }
  if (stateSheet) {
    stateSheet.getDataRange().getValues().slice(1).forEach(r => {
      const sid = String(r[0])
      const tid = String(r[1])
      if (!sid || !tid) return
      if (!stateMap[sid]) stateMap[sid] = {}
      stateMap[sid][tid] = { confirmed: !!r[2], completed: !!r[3] }
    })
  }

  // ダッシュボードシート再生成
  let dashboard = ss.getSheetByName('タスク確認状況')
  if (dashboard) ss.deleteSheet(dashboard)
  dashboard = ss.insertSheet('タスク確認状況')

  // タブ色を緑に固定
  dashboard.setTabColor('#4CAF50')

  // 「お知らせ」シートの直後に移動
  const noticeSheet = ss.getSheetByName('お知らせ')
  if (noticeSheet) {
    ss.setActiveSheet(dashboard)
    ss.moveActiveSheet(noticeSheet.getIndex() + 1)
  }

  // ヘッダー: 種別 | 項目 | 講師1 | 講師2 | ...
  const header = ['種別', '項目', ...teachers.map(t => t.name)]
  dashboard.getRange(1, 1, 1, header.length).setValues([header])
  dashboard.getRange(1, 1, 1, header.length).setFontWeight('bold')

  // 各行
  if (items.length > 0) {
    const rows = items.map(item => [
      item.type,
      item.text,
      ...teachers.map(t => {
        const st = stateMap[t.staffId]?.[item.itemId]
        if (!st) return ''
        if (item.type === 'タスク') {
          if (st.completed) return '🎉'
          if (st.confirmed) return '✓'
          return ''
        }
        return st.confirmed ? '✓' : ''
      })
    ])
    dashboard.getRange(2, 1, rows.length, header.length).setValues(rows)

    // セルの中央寄せ（講師列のみ）
    if (teachers.length > 0) {
      dashboard.getRange(1, 3, rows.length + 1, teachers.length).setHorizontalAlignment('center')
    }

    // 交互背景（緑テーマのバンディング、ヘッダーあり・フッターなし）
    const bandingRange = dashboard.getRange(1, 1, rows.length + 1, header.length)
    bandingRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREEN, true, false)
  }

  // 列幅・行高さ
  dashboard.setColumnWidth(1, 70)        // 種別
  dashboard.setColumnWidth(2, 240)       // 項目
  if (teachers.length > 0) {
    dashboard.setColumnWidths(3, teachers.length, 36)
    // 講師名ヘッダーを縦書き（文字は立てたまま縦に並ぶ）で省スペースに
    dashboard.getRange(1, 3, 1, teachers.length)
      .setVerticalText(true)
      .setVerticalAlignment('top')
    dashboard.setRowHeight(1, 130)
  }

  // 全体のフォント・縦中央寄せ
  if (items.length > 0) {
    dashboard.getRange(1, 1, items.length + 1, header.length)
      .setVerticalAlignment('middle')
      .setFontSize(11)
  }

  dashboard.setFrozenRows(1)
  dashboard.setFrozenColumns(2)

  // 凡例（最終行の下に追加）
  const legendRow = items.length + 3
  dashboard.getRange(legendRow, 1).setValue('【凡例】')
  dashboard.getRange(legendRow + 1, 1).setValue('✓ = 確認')
  dashboard.getRange(legendRow + 2, 1).setValue('🎉 = 完了（タスクのみ）')
  dashboard.getRange(legendRow + 3, 1).setValue('（空欄）= 未確認')
  dashboard.getRange(legendRow, 1, 4, 1).setFontColor('#666').setFontStyle('italic')

  if (ui) ui.alert('✅ 更新完了', `「タスク確認状況」シートを再生成しました。\n項目: ${items.length}件 / 講師: ${teachers.length}名`, ui.ButtonSet.OK)
  Logger.log(`updateTaskDashboard 完了: 項目${items.length}件 / 講師${teachers.length}名`)
}

// ============================================================
//  お知らせ/タスクの確認・完了状態を更新（個人別）
// ============================================================

function updateItemStatus({ staffId, itemId, field, value }) {
  if (!staffId || !itemId || !field) return { error: 'パラメータ不足' }
  if (!['confirmed', 'completed'].includes(field)) return { error: '不正なフィールド' }

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let stateSheet = ss.getSheetByName('お知らせ状態')
  if (!stateSheet) {
    stateSheet = ss.insertSheet('お知らせ状態')
    stateSheet.appendRow(['staffId', 'itemId', 'confirmed', 'completed', 'updatedAt'])
    stateSheet.getRange(1, 1, 1, 5).setBackground('#1565C0').setFontColor('white').setFontWeight('bold')
  }

  const rows = stateSheet.getDataRange().getValues()
  const now  = new Date()
  let rowIdx = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(staffId) && String(rows[i][1]) === String(itemId)) {
      rowIdx = i + 1
      break
    }
  }

  if (rowIdx === -1) {
    const confirmed = field === 'confirmed' ? !!value : false
    const completed = field === 'completed' ? !!value : false
    const finalConfirmed = (field === 'completed' && !!value) ? true : confirmed
    stateSheet.appendRow([staffId, itemId, finalConfirmed, completed, now])
  } else {
    const colIdx = field === 'confirmed' ? 3 : 4
    stateSheet.getRange(rowIdx, colIdx).setValue(!!value)
    stateSheet.getRange(rowIdx, 5).setValue(now)
    if (field === 'completed' && !!value) {
      stateSheet.getRange(rowIdx, 3).setValue(true)
    }
  }

  return { success: true }
}

// ============================================================
//  マニュアル（リンク集）取得
//  シート「マニュアル」: [カテゴリ, タイトル, URL, 並び順, 表示, 説明]
//  ・初回は自動作成 + プレースホルダ初期データ投入
//  ・URL空欄は「準備中」としてアプリに表示
// ============================================================

function getManual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName('マニュアル')

  if (!sheet) {
    sheet = ss.insertSheet('マニュアル')
    sheet.appendRow(['カテゴリ', 'タイトル', 'URL', '並び順', '表示', '説明'])
    sheet.getRange(1, 1, 1, 6).setBackground('#1565C0').setFontColor('white').setFontWeight('bold')

    // 初期プレースホルダ（URLは空欄、後で埋める運用）
    const initial = [
      ['📋 業務フロー',  '業務フロー全体（入室→退室）',     '',  1, true, ''],
      ['📋 業務フロー',  '打刻・勤務記録の付け方',           '',  2, true, ''],
      ['📋 業務フロー',  'comiru報告書の書き方',             '',  3, true, ''],
      ['💰 給与・規則',  '給与・締め日について',             '', 10, true, ''],
      ['💰 給与・規則',  '通勤手当・申請方法',               '', 11, true, ''],
      ['💰 給与・規則',  'グレード時給表',  'internal:rate-table', 12, true, '自分のグレード列を緑でハイライト'],
      ['📅 シフト',      'シフトのルール',                   '', 20, true, ''],
      ['📅 シフト',      'シフト希望の出し方',               '', 21, true, ''],
      ['🚨 困った時',    '体調不良・遅刻時の対応',           '', 30, true, ''],
      ['🚨 困った時',    'トラブル時の連絡先',               '', 31, true, ''],
      ['📞 連絡先',      'スタッフ連絡先一覧',               '', 40, true, ''],
    ]
    initial.forEach(row => sheet.appendRow(row))

    // 列幅
    sheet.setColumnWidth(1, 130)
    sheet.setColumnWidth(2, 280)
    sheet.setColumnWidth(3, 360)
    sheet.setColumnWidth(4, 60)
    sheet.setColumnWidth(5, 60)
    sheet.setColumnWidth(6, 220)
  } else {
    // 既存シートに internal: 行が無ければ自動補完（アプリ機能追加への追従）
    ensureInternalManualEntries(sheet)
  }

  const rows = sheet.getDataRange().getValues().slice(1)
  const items = rows
    .filter(r => r[1])                    // タイトル必須
    .filter(r => r[4] !== false)          // 表示=FALSEは除外
    .map(r => ({
      category: String(r[0] || ''),
      title   : String(r[1] || ''),
      url     : String(r[2] || ''),
      order   : Number(r[3]) || 999,
      desc    : String(r[5] || ''),
    }))
    .sort((a, b) => a.order - b.order)

  return { items }
}

// ============================================================
//  既存「マニュアル」シートに内部画面用エントリが無ければ自動追加
//  （アプリ側で internal: で始まるURLを使う機能が増えた時、後追いで補完）
// ============================================================

function ensureInternalManualEntries(sheet) {
  const INTERNAL_ENTRIES = [
    ['💰 給与・規則', 'グレード時給表', 'internal:rate-table', 12, true, '自分のグレード列を緑でハイライト'],
    // 今後追加する内部画面はここに足していく
  ]

  const existing = sheet.getDataRange().getValues().slice(1)
  const existingUrls = new Set(existing.map(r => String(r[2] || '').trim()))

  INTERNAL_ENTRIES.forEach(entry => {
    if (!existingUrls.has(entry[2])) {
      sheet.appendRow(entry)
    }
  })
}

// ============================================================
//  グレード時給表の取得（自分のグレード情報も付与）
// ============================================================

// アプリ側で非表示にする行のラベル（部分一致）
const HIDDEN_RATE_LABELS = [
  '大学入試',     // 大学入試1:1, 大学入試1:2
  '一斉(少)大',
  '一斉(多)大',
  '事務書類',
  'チーフ手当',
  'ボーナス',
]

function getRateTable(staffId) {
  const sheet = getSheet(SHEET.RATE)
  if (!sheet) return { headers: [], rows: [], myGrade: '' }

  const data = sheet.getDataRange().getValues()
  if (data.length === 0) return { headers: [], rows: [], myGrade: '' }

  // ヘッダー行（A1のラベル + 各グレード）
  const headers = data[0].map(v => String(v == null ? '' : v).trim())

  // データ行（1列目に値があるもの、かつ非表示ラベルでないもの）
  const rows = data.slice(1)
    .filter(r => r[0])
    .filter(r => {
      const label = String(r[0])
      return !HIDDEN_RATE_LABELS.some(h => label.includes(h))
    })
    .map(r => ({
      label : String(r[0]),
      values: r.slice(1).map(v => v === '' || v === null ? '' : v),
    }))

  // 自分のグレード（講師マスタから）
  let myGrade = ''
  if (staffId) {
    const masters = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)
    const m = masters.find(r => String(r[1]) === String(staffId))
    if (m) myGrade = String(m[3] || '').trim()
  }

  return { headers, rows, myGrade }
}

// ============================================================
//  講師登録申請を保存（未登録ユーザーがアプリから申請してきた時）
//  シート「登録申請」: [申請日時, LINE_ID, 氏名, 申請状況, 備考]
// ============================================================

function saveRegistrationRequest({ lineUserId, name }) {
  if (!lineUserId || !name) return { error: 'パラメータ不足' }

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const masterSheet = ss.getSheetByName(SHEET.MASTER)
  const masterRows  = masterSheet ? masterSheet.getDataRange().getValues().slice(1) : []
  const normalize   = n => String(n || '').replace(/[\s　]+/g, '').trim()
  const targetName  = normalize(name)
  const today       = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d')

  // ① LINE_ID が既に講師マスタにある？ → 既登録
  const existingByLineId = masterRows.findIndex(mr =>
    mr[0] && String(mr[0]) === String(lineUserId)
  )
  if (existingByLineId >= 0) {
    const staffId = String(masterRows[existingByLineId][1] || '')
    saveToRegistrationRequestSheet(lineUserId, name, '既登録', `既に登録済み: ${staffId} (${today})`)
    return { success: true, status: 'already-registered', staffId }
  }

  // ② 講師マスタに同氏名 + LINE_ID 空の行がある？ → 自動承認（マスタA列を直接更新）
  const candidates = masterRows
    .map((mr, i) => ({ mr, i }))
    .filter(({ mr }) => normalize(mr[2]) === targetName)
  const emptyIdMatch = candidates.find(c => !c.mr[0])
  if (emptyIdMatch) {
    const staffId = String(emptyIdMatch.mr[1] || '')
    masterSheet.getRange(emptyIdMatch.i + 2, 1).setValue(lineUserId)
    saveToRegistrationRequestSheet(lineUserId, name, '自動承認', `既存行 ${staffId} に自動登録 (${today})`)
    return { success: true, status: 'auto-approved', staffId }
  }

  // ③ 同姓同名で別LINE_ID既登録 → 要確認（手動承認に回す）
  let memo = ''
  if (candidates.length > 0) {
    memo = `同姓同名 ${String(candidates[0].mr[1] || '')} あり、要確認`
  }

  // ④ 完全新規 or 同姓同名コンフリクト → 「未対応」で登録申請に保存（手動承認）
  saveToRegistrationRequestSheet(lineUserId, name, '未対応', memo)
  return { success: true, status: 'pending' }
}

// 登録申請シートに保存（ヘルパー：同じLINE_IDがあれば更新、なければ追加）
function saveToRegistrationRequestSheet(lineUserId, name, status, memo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName('登録申請')
  if (!sheet) {
    sheet = ss.insertSheet('登録申請')
    sheet.appendRow(['申請日時', 'LINE_ID', '氏名', '申請状況', '備考'])
    sheet.getRange(1, 1, 1, 5).setBackground('#1565C0').setFontColor('white').setFontWeight('bold')
    sheet.setColumnWidth(1, 140)
    sheet.setColumnWidth(2, 280)
    sheet.setColumnWidth(3, 120)
    sheet.setColumnWidth(4, 100)
    sheet.setColumnWidth(5, 200)
  }

  const rows = sheet.getDataRange().getValues().slice(1)
  const idx = rows.findIndex(r => String(r[1]) === String(lineUserId))
  const now = new Date()

  if (idx >= 0) {
    sheet.getRange(idx + 2, 1).setValue(now)
    sheet.getRange(idx + 2, 3).setValue(name)
    sheet.getRange(idx + 2, 4).setValue(status)
    sheet.getRange(idx + 2, 5).setValue(memo || '')
  } else {
    sheet.appendRow([now, lineUserId, name, status, memo || ''])
  }
}

// ============================================================
//  登録申請を講師マスタに承認（メニューから手動実行）
// ============================================================

function approveRegistrations() {
  const ui = SpreadsheetApp.getUi()
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const reqSheet    = ss.getSheetByName('登録申請')
  const masterSheet = ss.getSheetByName(SHEET.MASTER)

  if (!reqSheet) {
    ui.alert('「登録申請」シートが見つかりません（まだ申請がない可能性あり）')
    return
  }
  if (!masterSheet) {
    ui.alert('「講師マスタ」シートが見つかりません')
    return
  }

  const reqRows = reqSheet.getDataRange().getValues().slice(1)
  const pending = reqRows
    .map((r, i) => ({ reqRow: i + 2, time: r[0], lineUserId: r[1], name: r[2], status: r[3] }))
    .filter(r => r.lineUserId && r.name && r.status !== '承認済' && r.status !== '既登録' && r.status !== 'スキップ')

  if (pending.length === 0) {
    ui.alert('未対応の登録申請はありません 🎉')
    return
  }

  // 講師マスタを読み込んで判定
  const masterRows = masterSheet.getDataRange().getValues().slice(1)
  const normalize = name => String(name || '').replace(/[\s　]+/g, '').trim()

  // 申請ごとに処理アクションを判定
  const decisions = pending.map(p => {
    // ① LINE_ID が既に講師マスタにある？
    const existingByLineId = masterRows.findIndex(mr =>
      mr[0] && String(mr[0]) === String(p.lineUserId)
    )
    if (existingByLineId >= 0) {
      return {
        ...p,
        action: 'already-registered',
        masterRowIdx: existingByLineId + 2,
        staffId: String(masterRows[existingByLineId][1] || ''),
      }
    }

    // ② 講師マスタに同氏名 + LINE_ID 空の行がある？
    const targetName = normalize(p.name)
    const candidates = masterRows
      .map((mr, i) => ({ mr, i }))
      .filter(({ mr }) => normalize(mr[2]) === targetName)

    const emptyIdMatch = candidates.find(c => !c.mr[0])
    if (emptyIdMatch) {
      return {
        ...p,
        action: 'update',
        masterRowIdx: emptyIdMatch.i + 2,
        staffId: String(emptyIdMatch.mr[1] || ''),
      }
    }

    // ③ 同氏名で別の LINE_ID が既登録 → 同姓同名コンフリクト
    if (candidates.length > 0) {
      return {
        ...p,
        action: 'name-conflict',
        existingId: String(candidates[0].mr[1] || ''),
      }
    }

    // ④ マッチなし → 新規作成
    return { ...p, action: 'create' }
  })

  // ダイアログメッセージ構築
  const lines = decisions.map((d, i) => {
    const num = `${i + 1}. ${d.name}`
    if (d.action === 'update')             return `${num} → ✅ 既存行 ${d.staffId} に LINE_ID を追加`
    if (d.action === 'create')             return `${num} → 🆕 新規行として作成`
    if (d.action === 'already-registered') return `${num} → ⏭ 既登録 (${d.staffId})、スキップ`
    if (d.action === 'name-conflict')      return `${num} → ⚠️ 同姓同名 ${d.existingId} あり、要確認・スキップ`
    return num
  }).join('\n')

  const counts = decisions.reduce((acc, d) => {
    acc[d.action] = (acc[d.action] || 0) + 1
    return acc
  }, {})

  const summary = [
    `更新: ${counts.update || 0}名`,
    `新規: ${counts.create || 0}名`,
    `スキップ: ${(counts['already-registered'] || 0) + (counts['name-conflict'] || 0)}名`,
  ].join(' / ')

  const res = ui.alert(
    '🆔 登録申請の承認',
    `${lines}\n\n[${summary}]\n\n実行しますか？`,
    ui.ButtonSet.OK_CANCEL
  )
  if (res !== ui.Button.OK) return

  // 既存スタッフIDの最大値（新規作成用）
  const maxNum = masterRows
    .map(r => String(r[1] || ''))
    .filter(s => /^S\d+$/.test(s))
    .reduce((max, s) => Math.max(max, parseInt(s.slice(1), 10) || 0), 0)

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d')
  let newCounter = 0

  decisions.forEach(d => {
    if (d.action === 'update') {
      // 既存行の A列（LINE_ID）に追加
      masterSheet.getRange(d.masterRowIdx, 1).setValue(d.lineUserId)
      reqSheet.getRange(d.reqRow, 4).setValue('承認済')
      reqSheet.getRange(d.reqRow, 5).setValue(`既存行 ${d.staffId} に登録 (${today})`)
    } else if (d.action === 'create') {
      const newId = `S${String(maxNum + (++newCounter)).padStart(3, '0')}`
      masterSheet.appendRow([d.lineUserId, newId, d.name, '', '', '', '', '', '', ''])
      reqSheet.getRange(d.reqRow, 4).setValue('承認済')
      reqSheet.getRange(d.reqRow, 5).setValue(`講師マスタ新規追加: ${newId} (${today})`)
    } else if (d.action === 'already-registered') {
      reqSheet.getRange(d.reqRow, 4).setValue('既登録')
      reqSheet.getRange(d.reqRow, 5).setValue(`既に登録済み: ${d.staffId} (${today})`)
    } else if (d.action === 'name-conflict') {
      reqSheet.getRange(d.reqRow, 4).setValue('スキップ')
      reqSheet.getRange(d.reqRow, 5).setValue(`同姓同名 ${d.existingId} あり、要確認 (${today})`)
    }
  })

  ui.alert(
    '✅ 完了',
    `${summary}\n\n` +
    `次の手順:\n` +
    `1. 「更新」した行: もう設定済みなのでそのまま運用可\n` +
    `2. 「新規」した行: グレード・通勤手段等を講師マスタで入力\n` +
    `3. 「⚠️ 要確認」: 同姓同名の可能性、登録申請シートで内容確認\n` +
    `4. 各講師にLINEで「登録完了」と連絡 → アプリ再起動で利用可能`,
    ui.ButtonSet.OK
  )
}

// ============================================================
//  打刻ログ保存
// ============================================================

function saveAttendance({ staffId, name, type, timestamp, location, commuteLabel, commuteAllowance, reason }) {
  const sheet = getSheet(SHEET.CLOCK)
  const now   = new Date(timestamp)
  const date  = formatDate(now)
  const time  = formatTime(now)
  const lat   = location ? location.lat : ''
  const lng   = location ? location.lng : ''

  // ヘッダー: [タイムスタンプ, スタッフID, 氏名, 打刻種別, 日付, 時刻, 緯度, 経度, 通勤手段, 通勤手当, 備考]
  sheet.appendRow([
    new Date(), staffId, name,
    type === 'in' ? '出勤' : '退勤',
    date, time, lat, lng,
    commuteLabel || '', commuteAllowance || 0,
    reason || '',  // K列：理由（後から手動追記も可）
  ])

  // 後付け打刻の場合は管理者にメール通知
  if (reason && reason.indexOf('[後付け]') === 0) {
    const typeLabel = type === 'in' ? '入室' : '退室'
    const subject = `【塾アプリ】後付け打刻通知: ${name} (${typeLabel} ${time})`
    const body = [
      `講師から後付けの打刻が登録されました。`,
      ``,
      `■ 講師:     ${name} (${staffId})`,
      `■ 打刻種別: ${typeLabel}`,
      `■ 日付:     ${date}`,
      `■ 時刻:     ${time}`,
      `■ 理由:     ${reason}`,
      ``,
      `打刻ログシートに記録されています。`,
      `内容に問題がないか確認してください。`,
    ].join('\n')
    try {
      sendAdminMail(subject, body)
    } catch (e) {
      Logger.log(`後付け通知メール送信失敗: ${e}`)
    }
  }

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
//  アプリ用 勤務履歴取得（現在の締め期間）
// ============================================================

function getHistory(staffId) {
  if (!staffId) return { records: [], period: '' }
  const today = new Date()
  const { start, end } = getClosingRange(today)

  // 打刻ログから in/out を収集
  const clockRows = getSheet(SHEET.CLOCK).getDataRange().getValues().slice(1)
  const dayMap = {}   // { 'YYYY-MM-DD': { clockIn, clockOut } }
  clockRows.forEach(row => {
    const [, sid,, type, dateRaw, time] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (String(sid) !== String(staffId)) return
    if (!isInRange(date, start, end)) return
    if (!dayMap[date]) dayMap[date] = {}
    const fmtTime = t => t instanceof Date
      ? Utilities.formatDate(t, Session.getScriptTimeZone(), 'HH:mm')
      : String(t)
    if (type === '出勤') dayMap[date].clockIn  = fmtTime(time)
    else                 dayMap[date].clockOut = fmtTime(time)
  })

  // 勤務記録ログから授業内容を収集
  const recRows = getSheet(SHEET.RECORD).getDataRange().getValues().slice(1)
  const lessonMap = {}  // { 'YYYY-MM-DD': { lines: [], V: 0 } }
  recRows.forEach(row => {
    const [, sid,, dateRaw, typeLabel, grade, target, amount,,,, V] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (String(sid) !== String(staffId)) return
    if (!isInRange(date, start, end)) return
    if (!lessonMap[date]) lessonMap[date] = { lines: [], V: 0 }
    const gradeStr  = grade  ? `${grade}` : ''
    const targetStr = target ? `/${target}` : ''
    const amtStr    = amount ? `×${amount}` : ''
    lessonMap[date].lines.push(`${typeLabel} ${gradeStr}${targetStr}${amtStr}`)
    lessonMap[date].V = parseFloat(V) || lessonMap[date].V
  })

  // 両方をマージして表示用レコードを作成
  const allDates = [...new Set([...Object.keys(dayMap), ...Object.keys(lessonMap)])].sort()
  const fmtH = h => {
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    return mm > 0 ? `${hh}h${mm}m` : `${hh}h`
  }

  const records = allDates.map(date => {
    const d  = dayMap[date]    || {}
    const l  = lessonMap[date] || {}
    const ymd = date.split('-')
    const label = ymd.length === 3 ? `${parseInt(ymd[1])}/${parseInt(ymd[2])}` : date
    return {
      date    : label,
      clockIn : d.clockIn  || '--:--',
      clockOut: d.clockOut || '--:--',
      lessons : l.lines?.join('、') || '',
      total   : l.V > 0 ? fmtH(l.V) : '--',
    }
  })

  // 期間ラベル（start/end は 'YYYY-MM-DD' 文字列）
  const fmt = s => { const p = s.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}` }
  const period = `${fmt(start)}〜${fmt(end)} の記録`

  return { records, period }
}

// ============================================================
//  お知らせ・タスク統合取得（お知らせシートから + 個人別状態をマージ）
//
//  シート構成:
//    お知らせ       : [itemId, type, text, date, dueDate, expiry]
//                     type = 'お知らせ' | 'タスク'
//                     既存データ（type 空欄）は自動で「お知らせ」扱い
//    お知らせ状態   : [staffId, itemId, confirmed, completed, updatedAt]
// ============================================================

function getItems(staffId) {
  if (!staffId) return { items: [] }
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  // メインシート
  let sheet = ss.getSheetByName('お知らせ')
  if (!sheet) {
    sheet = ss.insertSheet('お知らせ')
    sheet.appendRow(['itemId', 'type', 'text', 'date', 'dueDate', 'expiry'])
    sheet.getRange(1, 1, 1, 6).setBackground('#1565C0').setFontColor('white').setFontWeight('bold')
    return { items: [] }
  }

  // 状態シート（個人別）
  let stateSheet = ss.getSheetByName('お知らせ状態')
  if (!stateSheet) {
    stateSheet = ss.insertSheet('お知らせ状態')
    stateSheet.appendRow(['staffId', 'itemId', 'confirmed', 'completed', 'updatedAt'])
    stateSheet.getRange(1, 1, 1, 5).setBackground('#1565C0').setFontColor('white').setFontWeight('bold')
  }

  // 個人状態をマップ化
  const stateMap = {}
  stateSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[0]) === String(staffId) && r[1]) {
      stateMap[String(r[1])] = { confirmed: !!r[2], completed: !!r[3] }
    }
  })

  const data = sheet.getDataRange().getValues()
  if (data.length === 0) return { items: [] }

  // ── ヘッダー名で列を解決（旧スキーマ [date, text, expiry] にも自動対応） ──
  const header = data[0].map(h => String(h || '').trim())
  const idx    = name => header.indexOf(name)
  const iItem  = idx('itemId')
  const iType  = idx('type')
  const iText  = idx('text')
  const iDate  = idx('date')
  const iDue   = idx('dueDate')
  const iExp   = idx('expiry')

  // 旧スキーマ（text 列が無い）= [date, text, expiry] 構成
  const isLegacy = iText === -1

  const today = new Date()
  const items = []
  const fmtDate = v => v instanceof Date ? `${v.getMonth()+1}/${v.getDate()}` : (v ? String(v) : '')

  data.slice(1).forEach((row, rowIdx) => {
    let itemId, type, text, dateVal, dueDateVal, expiry

    if (isLegacy) {
      dateVal    = row[0]
      text       = row[1]
      expiry     = row[2]
      itemId     = `legacy-${rowIdx}`
      type       = 'お知らせ'
      dueDateVal = ''
    } else {
      itemId     = (iItem >= 0 && row[iItem]) ? String(row[iItem]) : `legacy-${rowIdx}`
      type       = (iType >= 0 && String(row[iType] || '').trim()) || 'お知らせ'
      text       = iText >= 0 ? row[iText] : ''
      dateVal    = iDate >= 0 ? row[iDate] : ''
      dueDateVal = iDue  >= 0 ? row[iDue]  : ''
      expiry     = iExp  >= 0 ? row[iExp]  : ''
    }

    if (!text) return
    if (expiry instanceof Date && expiry < today) return

    const st = stateMap[itemId] || { confirmed: false, completed: false }
    items.push({
      itemId,
      type,
      text   : String(text),
      date   : fmtDate(dateVal),
      dueDate: fmtDate(dueDateVal),
      confirmed: st.confirmed,
      completed: st.completed,
    })
  })

  // 新しい順（最大20件）
  return { items: items.slice(-20).reverse() }
}

// ============================================================
//  互換用：旧 getNotices（バー表示などで使用）
// ============================================================
function getNotices() {
  // 互換アダプタ：getItems から お知らせ のみ抽出
  return { notices: [] }  // 旧呼び出し向けの空配列フォールバック
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
  const fmtTime = t => t instanceof Date
    ? Utilities.formatDate(t, 'Asia/Tokyo', 'HH:mm')
    : String(t)

  clockRows.forEach(row => {
    const [, staffId,, type, dateRaw, timeRaw,,, commuteLabel, commuteAllowance, reason] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    const time = fmtTime(timeRaw)
    if (!isInRange(date, start, end)) return
    if (!clockMap[staffId])        clockMap[staffId] = {}
    if (!clockMap[staffId][date])  clockMap[staffId][date] = {}
    if (type === '出勤') {
      clockMap[staffId][date].in               = time
      clockMap[staffId][date].commuteLabel     = commuteLabel    || ''
      clockMap[staffId][date].commuteAllowance = commuteAllowance || 0
    } else {
      clockMap[staffId][date].out    = time
      clockMap[staffId][date].reason = reason || ''  // K列：理由
    }
  })

  // ── 勤務記録ログ読み込み ──
  const recRows = getSheet(SHEET.RECORD).getDataRange().getValues().slice(1)
  const recMap  = {}   // { staffId: { date: { col: 合計値 } } }
  const vMap    = {}   // { staffId: { date: V合計(h) } }
  recRows.forEach(row => {
    const [, staffId,, dateRaw, typeLabel, grade,, amount,,,, V] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
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

  // グレード時給表（新規シート作成時に使用）
  const rateSheet   = getSheet(SHEET.RATE)
  const rateData    = rateSheet.getDataRange().getValues()
  const rateHeaders = rateData[0]
  const templateSheet = ss.getSheetByName('テンプレート')

  masters.forEach(master => {
    const staffId  = master[1]
    const name     = master[2]
    const grade    = master[3]
    const isSocial = (grade === '社員')

    let staffSheet = ss.getSheetByName(name)

    // ── 講師マスタにいるがシートがない → テンプレートから自動作成 ──
    if (!staffSheet) {
      if (!templateSheet) {
        Logger.log(`テンプレートなし。シート作成スキップ: ${name}`)
        return
      }
      staffSheet = templateSheet.copyTo(ss)
      staffSheet.setName(name)
      const dayCount = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
      fillStaffSheet(staffSheet, name, grade, new Date(start), dayCount, rateData, rateHeaders)
      protectStaffSheet(staffSheet)
      Logger.log(`新規講師シート自動作成: ${name}（${start}〜${end}）`)
    }

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

        // T列（MM合計）・U列（非MM合計）・V列（勤務時間）はテンプレートの数式で自動計算
      }

      // W列（23）入室, X列（24）退室
      if (inTime)  staffSheet.getRange(i + 1, 23).setValue(inTime)
      if (outTime) staffSheet.getRange(i + 1, 24).setValue(outTime)
      // Y列（合計時間）= X-W、Z列（時間差）= Y-V はテンプレートの数式で自動計算
      // AA列（27）交通費
      const commuteAmt = clock.commuteAllowance || 0
      if (commuteAmt) staffSheet.getRange(i + 1, COL_AA).setValue(commuteAmt)
      // AB列（28）備考（Z≥1h時の理由）
      const reason = clock.reason || ''
      if (reason) staffSheet.getRange(i + 1, 28).setValue(reason)

      // Z異常チェック（V>0 かつ Z<-0.25 または Z>=1）
      // ただし打刻ログAB列（備考欄）に理由が記入されていればOK → エラー除外
      const hasReason = !!(clock.reason)
      if (V > 0 && !hasReason && (Z < -0.25 || Z >= 1)) {
        zErrors.push({ name, date, V: V.toFixed(2), Y: Y.toFixed(2), Z: Z.toFixed(2) })
      }
    }
  })

  // ── 毎日：日次スナップショット ──
  dailySnapshot(ss)

  // ── 21日：給与履歴記録 → 月次バックアップ → 講師シートリセット ──
  if (today.getDate() === 21) {
    const prevEnd   = new Date(today.getFullYear(), today.getMonth(), 20)
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 21)
    recordPayrollHistory(ss, masters, prevStart, prevEnd)
    monthlyBackup(ss, prevEnd)
    autoMonthlyUpdate(ss, today)
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

  // ── Z異常行をログにハイライト ──
  highlightZErrors(ss, zErrors)

  // ── 総支給額シート更新 ──
  updateSougouSheet(ss, masters)

  // ── シート順を整列（講師マスタ順で先頭に）──
  reorderSheets(ss, masters)

  // ── タスク確認状況ダッシュボードを更新（前日までの状態をスナップショット）──
  try {
    updateTaskDashboard()
  } catch (e) {
    Logger.log(`updateTaskDashboard エラー: ${e.message}`)
  }

  Logger.log(`バッチ完了: ${zErrors.length}件の異常`)
}

// ============================================================
//  シート並び替え（講師マスタ順で先生シートを先頭に）
// ============================================================

// ============================================================
//  総支給額シート更新
// ============================================================

// ============================================================
//  Z異常行をログにオレンジでハイライト（修正済みは自動解除）
// ============================================================

function highlightZErrors(ss, zErrors) {
  const clockSheet = getSheet(SHEET.CLOCK)
  const recSheet   = getSheet(SHEET.RECORD)
  const COLOR      = '#FFB347'  // オレンジ

  // ── 前回のハイライトをクリア ──
  const clearHighlight = sheet => {
    const lastRow = sheet.getLastRow()
    if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).setBackground(null)
  }
  clearHighlight(clockSheet)
  clearHighlight(recSheet)

  if (zErrors.length === 0) { Logger.log('Z異常なし・ハイライトクリア完了'); return }

  // name_date のセットを作成
  const errorKeys = new Set(zErrors.map(e => e.name + '_' + e.date))

  // 打刻ログをハイライト
  clockSheet.getDataRange().getValues().forEach(function(row, i) {
    if (i === 0) return
    const name    = String(row[2])
    const dateRaw = row[4]
    const date    = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (errorKeys.has(name + '_' + date)) {
      clockSheet.getRange(i + 1, 1, 1, clockSheet.getLastColumn()).setBackground(COLOR)
    }
  })

  // 勤務記録ログをハイライト
  recSheet.getDataRange().getValues().forEach(function(row, i) {
    if (i === 0) return
    const name    = String(row[2])
    const dateRaw = row[3]
    const date    = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (errorKeys.has(name + '_' + date)) {
      recSheet.getRange(i + 1, 1, 1, recSheet.getLastColumn()).setBackground(COLOR)
    }
  })

  Logger.log('Z異常ハイライト完了（' + zErrors.length + '件）')
}

// ============================================================
//  総支給額シート更新
// ============================================================

function updateSougouSheet(ss, masters) {
  const sougSheet = ss.getSheetByName('総支給額')
  if (!sougSheet) { Logger.log('総支給額シートが見つかりません'); return }

  // ── A1・A2・A4：期間ヘッダを更新 ──
  const { start, end } = getClosingRange(new Date())
  const startDate = new Date(start)
  const endDate   = new Date(end)
  const toJP = d => `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
  sougSheet.getRange('A1').setValue(`${endDate.getFullYear()}年${endDate.getMonth()+1}月分`)
  sougSheet.getRange('A2').setValue('開始日')
  sougSheet.getRange('A3').setValue(toJP(startDate))
  sougSheet.getRange('A4').setValue('終了日')
  sougSheet.getRange('A5').setValue(toJP(endDate))

  const DATA_START = 2  // 2行目からデータ

  // ── F列(弥生用数式)・H列(ボーナス)・I列(調整)の既存値を保持 ──
  const bonusMap = {}, adjustMap = {}, fFormulaMap = {}
  const lastRow = sougSheet.getLastRow()
  if (lastRow >= DATA_START) {
    const rowCount = lastRow - DATA_START + 1
    const vals     = sougSheet.getRange(DATA_START, 2, rowCount, 8).getValues()
    const fFormulas = sougSheet.getRange(DATA_START, 6, rowCount, 1).getFormulas()
    vals.forEach((row, i) => {
      const name = String(row[0])
      if (name && name !== '合計') {
        bonusMap[name]    = row[6] || 0       // H列
        adjustMap[name]   = row[7] || 0       // I列
        fFormulaMap[name] = fFormulas[i][0] || ''  // F列の数式
      }
    })
    sougSheet.getRange(DATA_START, 2, rowCount, 12).clearContent()
  }

  // ── 各講師データ収集 ──
  const staffList = []
  masters.forEach(master => {
    const name  = master[2]
    const grade = master[3]
    if (!name) return
    const staffSheet = ss.getSheetByName(name)
    let v33 = 0, d36 = 0, g36 = 0, j36 = 0, l36 = 0
    if (staffSheet) {
      v33 = staffSheet.getRange(SUM_ROW,  22).getValue() || 0  // V33: 勤務時間合計
      d36 = staffSheet.getRange(CALC_ROW, 22).getValue() || 0  // V36: 出勤数
      g36 = staffSheet.getRange(CALC_ROW, 23).getValue() || 0  // W36: チーフ手当
      j36 = staffSheet.getRange(CALC_ROW, 20).getValue() || 0  // T36: 授業給計
      l36 = staffSheet.getRange(CALC_ROW, 21).getValue() || 0  // U36: 交通費
    }
    staffList.push({
      name, grade,
      d: d36,
      e: v33,
      // f列（弥生用）はシートの数式で計算
      g: g36,
      h: bonusMap[name]  || 0,
      i: adjustMap[name] || 0,
      j: j36,
      l: l36,
    })
  })

  // ── シートに書き込み（F列はシート数式のためスキップ）──
  staffList.forEach((d, idx) => {
    const row = DATA_START + idx
    // B〜E列（講師名・グレード・勤務日数・勤務時間）
    sougSheet.getRange(row, 2, 1, 4).setValues([[d.name, d.grade, d.d, d.e]])
    // F列：弥生用（ユーザー入力の数式を復元）
    const fFormula = fFormulaMap[d.name] || ''
    if (fFormula) sougSheet.getRange(row, 6).setFormula(fFormula)
    // G〜J列（チーフ手当・ボーナス・調整・授業給計）
    sougSheet.getRange(row, 7, 1, 4).setValues([[d.g, d.h, d.i, d.j]])
    // K列: 数式
    sougSheet.getRange(row, 11).setFormula(`=G${row}+H${row}+I${row}+J${row}`)
    // L列: 交通費
    sougSheet.getRange(row, 12).setValue(d.l)
    // M列: 数式
    sougSheet.getRange(row, 13).setFormula(`=K${row}+L${row}`)
  })

  // E列を [h]:mm 形式で表示
  if (staffList.length > 0) {
    sougSheet.getRange(DATA_START, 5, staffList.length, 1).setNumberFormat('[h]:mm')
  }

  // ── 合計行 ──
  if (staffList.length === 0) { Logger.log('講師データなし'); return }
  const sumRow      = DATA_START + staffList.length
  const lastDataRow = sumRow - 1
  sougSheet.getRange(sumRow, 2).setValue('合計')
  const sumCols = ['D','E','G','H','I','J','K','L','M']  // F列はシート数式
  const colNums = {'D':4,'E':5,'G':7,'H':8,'I':9,'J':10,'K':11,'L':12,'M':13}
  sumCols.forEach(function(col) {
    sougSheet.getRange(sumRow, colNums[col]).setFormula('=SUM(' + col + DATA_START + ':' + col + lastDataRow + ')')
  })
  sougSheet.getRange(sumRow, 5).setNumberFormat('[h]:mm')
  sougSheet.getRange(sumRow, 2, 1, 12).setBackground('#FFFF00').setFontWeight('bold')

  Logger.log(`総支給額シート更新完了（${staffList.length}名）`)
}

// ============================================================
//  シート並び替え（講師マスタ順で先生シートを先頭に）
// ============================================================

function reorderSheets(ss, masters) {
  const FIXED = [SHEET.MASTER, SHEET.ADMIN, SHEET.CLOCK, SHEET.RECORD,
                 '給与履歴', SHEET.RATE, 'テンプレート', 'お知らせ']
  const staffNames = masters.map(r => r[2]).filter(name => name && !FIXED.includes(name) && name !== '総支給額')

  let position = 1

  // 1番目：総支給額
  const sougSheet = ss.getSheetByName('総支給額')
  if (sougSheet) {
    ss.setActiveSheet(sougSheet)
    ss.moveActiveSheet(position++)
  }

  // 2番目以降：講師シート（講師マスタ順）
  staffNames.forEach(name => {
    const sheet = ss.getSheetByName(name)
    if (!sheet) return
    ss.setActiveSheet(sheet)
    ss.moveActiveSheet(position++)
  })
  Logger.log(`シート順整列完了（総支給額 + 講師${position - 2}名）`)
}

// ============================================================
//  バックアップフォルダ取得ユーティリティ
//  バックアップ/monthly/ または バックアップ/daily/ を返す
// ============================================================

function getBackupSubFolder(ss, type) {
  const parent  = DriveApp.getFileById(ss.getId()).getParents().next()
  const getBF   = (folder, name) => {
    const it = folder.getFoldersByName(name)
    return it.hasNext() ? it.next() : folder.createFolder(name)
  }
  const root = getBF(parent, 'バックアップ')
  return getBF(root, type)  // 'monthly' または 'daily'
}

// ============================================================
//  日次スナップショット（毎日 nightlyBatch で自動実行）
//  バックアップ/daily/ に保存、31日より古いものは自動削除
// ============================================================

function dailySnapshot(ss) {
  const today    = new Date()
  const dateStr  = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd')
  const fileName = `スナップショット_${dateStr}`
  const folder   = getBackupSubFolder(ss, 'daily')

  // 当日分が既にあればスキップ
  if (folder.getFilesByName(fileName).hasNext()) {
    Logger.log(`スナップショット済み: ${fileName}`)
    return
  }

  // コピー作成
  DriveApp.getFileById(ss.getId()).makeCopy(fileName, folder)
  Logger.log(`スナップショット作成: ${fileName}`)

  // 31日より古いファイルをゴミ箱へ
  const cutoff = new Date(today.getTime() - 31 * 86400000)
  const files  = folder.getFiles()
  let deleted  = 0
  while (files.hasNext()) {
    const f = files.next()
    if (f.getDateCreated() < cutoff) { f.setTrashed(true); deleted++ }
  }
  if (deleted > 0) Logger.log(`古いスナップショット削除: ${deleted}件`)
}

// ============================================================
//  月次バックアップ（毎月21日）
//  ① バックアップ/monthly/ にスプレッドシートのコピー
//  ② Excelに変換して本社にメール送信
// ============================================================

function monthlyBackup(ss, endDate) {
  const dt       = endDate instanceof Date ? endDate : new Date(endDate)
  const year     = dt.getFullYear()
  const month    = dt.getMonth() + 1
  const label    = `${year}年${month}月分`
  const fileName = `アルバイト明細_${label}`
  const folder   = getBackupSubFolder(ss, 'monthly')

  // 既存バックアップチェック
  if (folder.getFilesByName(fileName).hasNext()) {
    Logger.log(`月次バックアップ済み: ${fileName}`)
    return
  }

  // コピー作成
  const backupFile = DriveApp.getFileById(ss.getId()).makeCopy(fileName, folder)
  Logger.log(`月次バックアップ作成: ${fileName}`)

  // Excelに変換してメール送信
  const url      = `https://docs.google.com/spreadsheets/d/${backupFile.getId()}/export?format=xlsx`
  const token    = ScriptApp.getOAuthToken()
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const xlsxBlob = response.getBlob().setName(`${fileName}.xlsx`)

  const adminRows = getSheet(SHEET.ADMIN).getDataRange().getValues().slice(1)
  adminRows
    .filter(r => r[2] === true || r[2] === '✓' || r[2] === '本社')
    .forEach(row => {
      if (!row[1]) return
      GmailApp.sendEmail(
        row[1],
        `【${label}】アルバイト明細`,
        `本社 経理部 御中\n\nおつかれさまです。\n\n${label}のアルバイト明細をお送りします。\n\nご確認をよろしくお願いいたします。`,
        { attachments: [xlsxBlob] }
      )
      Logger.log(`Excel送信: ${row[1]}`)
    })
}

// ============================================================
//  給与履歴記録（21日バッチで月次バックアップ前に自動実行）
//  各講師シートの T36・U36・W36・X36・V36 を給与履歴シートに追記
// ============================================================

function recordPayrollHistory(ss, masters, periodStart, periodEnd) {
  const sheetName = '給与履歴'
  let histSheet   = ss.getSheetByName(sheetName)
  if (!histSheet) {
    histSheet = ss.insertSheet(sheetName)
    histSheet.appendRow(['期間開始', '期間終了', 'スタッフID', '氏名', 'グレード',
                         '授業料', '交通費', 'チーフ手当', '合計支給額', '出勤数', '記録日時'])
    histSheet.getRange(1, 1, 1, 11)
      .setBackground('#1565C0').setFontColor('white').setFontWeight('bold')
  }

  const startStr = Utilities.formatDate(periodStart, 'Asia/Tokyo', 'yyyy/M/d')
  const endStr   = Utilities.formatDate(periodEnd,   'Asia/Tokyo', 'yyyy/M/d')

  masters.forEach(master => {
    const staffId = master[1]
    const name    = master[2]
    const grade   = master[3]
    if (!name) return

    const staffSheet = ss.getSheetByName(name)
    if (!staffSheet) return

    // 36行目から集計値を読み取る（T=20, U=21, W=23, X=24, V=22）
    const t36 = staffSheet.getRange(CALC_ROW, 20).getValue() || 0  // 授業料合計
    const u36 = staffSheet.getRange(CALC_ROW, 21).getValue() || 0  // 交通費合計
    const w36 = staffSheet.getRange(CALC_ROW, 23).getValue() || 0  // チーフ手当
    const x36 = staffSheet.getRange(CALC_ROW, 24).getValue() || 0  // 合計支給額
    const v36 = staffSheet.getRange(CALC_ROW, 22).getValue() || 0  // 出勤数

    histSheet.appendRow([startStr, endStr, staffId, name, grade,
                         t36, u36, w36, x36, v36, new Date()])
    Logger.log(`給与履歴記録: ${name} ${startStr}〜${endStr} 合計${x36}円`)
  })
}

// ============================================================
//  月次更新を自動実行（21日 nightlyBatch から呼び出し）
// ============================================================

function autoMonthlyUpdate(ss, today) {
  let periodStart, periodEnd
  if (today.getDate() >= 21) {
    periodStart = new Date(today.getFullYear(), today.getMonth(), 21)
    periodEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 20)
  } else {
    periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 21)
    periodEnd   = new Date(today.getFullYear(), today.getMonth(), 20)
  }
  const dayCount = Math.round((periodEnd - periodStart) / 86400000) + 1

  const templateSheet = ss.getSheetByName('テンプレート')
  if (!templateSheet) {
    Logger.log('テンプレートシートが見つかりません。月次更新スキップ。')
    sendAdminMail('【月次更新エラー】', 'テンプレートシートが見つからないため月次更新をスキップしました。手動で実行してください。')
    return
  }

  const rateSheet   = getSheet(SHEET.RATE)
  const rateData    = rateSheet.getDataRange().getValues()
  const rateHeaders = rateData[0]
  const masterRows  = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)

  masterRows.forEach(master => {
    const name  = master[2]
    const grade = master[3]
    if (!name) return

    let staffSheet = ss.getSheetByName(name)
    if (!staffSheet) {
      staffSheet = templateSheet.copyTo(ss)
      staffSheet.setName(name)
    }
    fillStaffSheet(staffSheet, name, grade, periodStart, dayCount, rateData, rateHeaders)
    protectStaffSheet(staffSheet)
  })

  const startLabel = Utilities.formatDate(periodStart, 'Asia/Tokyo', 'M/d')
  const endLabel   = Utilities.formatDate(periodEnd,   'Asia/Tokyo', 'M/d')
  Logger.log(`月次更新完了（自動）: ${startLabel}〜${endLabel}`)
}

// ============================================================
//  月次更新（手動実行用・緊急時やテスト用）
//  通常は21日の nightlyBatch が自動実行する
// ============================================================

function monthlyUpdate() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const today = new Date()
  autoMonthlyUpdate(ss, today)
  SpreadsheetApp.getUi().alert('月次更新が完了しました！\n（ログは履歴として保持）')
}

// ============================================================
//  講師シート保護（B2:AB36 を手動編集禁止）
// ============================================================

function protectStaffSheet(sheet) {
  // 既存の保護をすべて解除してから再設定
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => p.remove())

  const protection = sheet.getRange('B2:AB36').protect()
  protection.setDescription('GAS管理エリア（手動編集禁止）')
  // 自分（スクリプトオーナー）のみ編集可能・それ以外は警告
  protection.setWarningOnly(false)
  Logger.log(`シート保護設定: ${sheet.getName()}`)
}

// ============================================================
//  講師シートにデータを書き込み（構造・数式はテンプレートから引き継ぎ）
//  GASが書くのは：氏名・グレード・日付・コマ単価・チーフ手当 のみ
// ============================================================

function fillStaffSheet(sheet, staffName, grade, periodStart, dayCount, rateData, rateHeaders) {

  // ── データ行をクリア（C〜R授業コマ数・W-X入退室・AA交通費）──
  // ※ T・U・V・Y・Z はテンプレートの数式のため clearContent しない
  sheet.getRange(DATA_START_ROW, 3,  DATA_MAX_ROWS, 16).clearContent() // C-R（授業コマ数）
  sheet.getRange(DATA_START_ROW, 23, DATA_MAX_ROWS, 2).clearContent()  // W-X（入退室）
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
  // 社員グレードは時給表不要のためスキップ
  const gradeColIdx = rateHeaders.indexOf(grade)
  if (gradeColIdx < 0) {
    if (grade !== '社員') Logger.log(`グレード "${grade}" が時給表に見つかりません（${staffName}）`)
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
//  テンプレートの数式セルを保護（一度だけ実行）
//  ※ 編集しようとすると警告が出るが、強制的に編集は可能
// ============================================================

function protectTemplateFormulas() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName('テンプレート')
  if (!sheet) {
    SpreadsheetApp.getUi().alert('「テンプレート」シートが見つかりません')
    return
  }

  // 既存の保護を一旦クリア
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => p.remove())

  // 保護するセル範囲の定義
  const targets = [
    { range: sheet.getRange('T2:T32'),  desc: 'MM合計コマ（数式）' },
    { range: sheet.getRange('U2:U32'),  desc: '非MM合計コマ（数式）' },
    { range: sheet.getRange('V2:V32'),  desc: '勤務時間日計（数式）' },
    { range: sheet.getRange('Y2:Y32'),  desc: '合計時間（数式）' },
    { range: sheet.getRange('Z2:Z32'),  desc: '時間差（数式）' },
    { range: sheet.getRange('33:33'),   desc: '合計行（数式）' },
    { range: sheet.getRange('C36:S36'), desc: '授業料・集計行（数式）' },
  ]

  targets.forEach(({ range, desc }) => {
    const protection = range.protect()
    protection.setDescription(desc)
    protection.setWarningOnly(true)  // 警告のみ（誤操作防止）
  })

  SpreadsheetApp.getUi().alert(
    '数式セルの保護を設定しました！\n\n' +
    '保護したセル:\n' +
    targets.map(t => `・${t.desc}`).join('\n') +
    '\n\n※ 編集しようとすると警告が出ます（強制編集は可能）'
  )
  Logger.log('テンプレート保護設定完了')
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
    {
      name   : 'お知らせ',
      headers: ['日付', '内容', '掲載終了日'],
      color  : '#FF9800',
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

// ============================================================
//  22:30 リマインド（入室あり・退室 or 勤務記録なし の講師に通知）
// ============================================================

function eveningReminder() {
  const today = formatDate(new Date())

  // ── 今日入室した人を収集 ──
  const clockRows = getSheet(SHEET.CLOCK).getDataRange().getValues().slice(1)
  const staffStatus = {}  // { staffId: { hasIn, hasOut } }
  clockRows.forEach(row => {
    const [, staffId,, type, dateRaw] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (date !== today) return
    if (!staffStatus[staffId]) staffStatus[staffId] = { hasIn: false, hasOut: false }
    if (type === '出勤') staffStatus[staffId].hasIn  = true
    if (type === '退勤') staffStatus[staffId].hasOut = true
  })

  // ── 今日勤務記録がある人を収集 ──
  const recRows = getSheet(SHEET.RECORD).getDataRange().getValues().slice(1)
  recRows.forEach(row => {
    const [, staffId,, dateRaw] = row
    const date = dateRaw instanceof Date ? formatDate(dateRaw) : String(dateRaw)
    if (date !== today) return
    if (staffStatus[staffId]) staffStatus[staffId].hasRecord = true
  })

  // ── 講師マスタから LINE ID を取得 ──
  const lineIdMap = {}  // { staffId: lineUserId }
  getSheet(SHEET.MASTER).getDataRange().getValues().slice(1).forEach(r => {
    if (r[0] && r[1]) lineIdMap[String(r[1])] = String(r[0])
  })

  // ── 入室あり・退室 or 勤務記録なし の人に通知 ──
  let count = 0
  Object.entries(staffStatus).forEach(([staffId, s]) => {
    if (!s.hasIn) return   // 入室なし → スキップ
    if (s.hasOut)  return  // 退室あり → 正常完了

    const lineUserId = lineIdMap[staffId]
    if (!lineUserId) return

    let msg = '【中谷塾 西明石】\n'
    if (!s.hasRecord) {
      msg += '勤務記録と退室打刻を入力してください🙏'  // 記録も退室もなし
    } else {
      msg += '退室打刻を入力してください🙏'            // 記録あり・退室なし
    }

    sendLinePush(lineUserId, msg)
    count++
  })

  Logger.log(`22:30リマインド送信: ${count}件`)
}

// LINE push通知送信
function sendLinePush(lineUserId, message) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN')
  if (!token) { Logger.log('LINEチャンネルトークン未設定'); return }

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method  : 'post',
    headers : {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    payload : JSON.stringify({
      to      : lineUserId,
      messages: [{ type: 'text', text: message }],
    }),
  })
  Logger.log(`LINE push送信: ${lineUserId}`)
}

// LINEチャンネルアクセストークンを登録（メニューから実行）
function promptLineChannelToken() {
  const ui  = SpreadsheetApp.getUi()
  const res = ui.prompt(
    '🔑 LINEトークン登録',
    'LINE Messaging API のチャンネルアクセストークンを貼り付けてください：',
    ui.ButtonSet.OK_CANCEL
  )
  if (res.getSelectedButton() !== ui.Button.OK) return
  const token = res.getResponseText().trim()
  if (!token) { ui.alert('トークンが空です'); return }
  PropertiesService.getScriptProperties().setProperty('LINE_CHANNEL_TOKEN', token)
  ui.alert('✅ 登録完了！\nリマインドトリガーも設定してください。')
}


// 22:30トリガーを設定（メニューから一度だけ実行）
function setupEveningReminderTrigger() {
  // 既存のリマインドトリガーを削除
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'eveningReminder')
    .forEach(t => ScriptApp.deleteTrigger(t))

  // 毎日 22:30 に設定
  ScriptApp.newTrigger('eveningReminder')
    .timeBased()
    .atHour(22)
    .nearMinute(30)
    .everyDays(1)
    .create()

  SpreadsheetApp.getUi().alert('✅ 22:30リマインドトリガーを設定しました！')
  Logger.log('eveningReminderトリガー設定完了')
}

// ============================================================
//  テスト関数（開発・確認用）
// ============================================================

function testNightlyBatch() {
  nightlyBatch()
}

// 21日〆テスト：前月21日〜今月20日を「締め済み」として月次処理を実行
function testMonthlyProcess() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet()
  const today   = new Date()

  // 前の締め期間（先月21日〜今月20日）
  const prevEnd   = new Date(today.getFullYear(), today.getMonth(), 20)
  const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 21)

  Logger.log('=== 月次処理テスト開始 ===')
  Logger.log(`対象期間: ${formatDate(prevStart)} 〜 ${formatDate(prevEnd)}`)

  // ① 給与履歴に記録
  const masters = getSheet(SHEET.MASTER).getDataRange().getValues().slice(1)
  recordPayrollHistory(ss, masters, prevStart, prevEnd)

  // ② 月次バックアップ（Excelメール送信）
  monthlyBackup(ss, prevEnd)

  // ③ 翌期間の講師シートをリセット・再作成
  autoMonthlyUpdate(ss, new Date(today.getFullYear(), today.getMonth(), 21))

  Logger.log('=== 月次処理テスト完了 ===')
}

// 三方哲郎のテストデータ作成（打刻・勤務記録・給与履歴 各10件）
function createTestDataSanpo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  // 講師マスタから三方哲郎の情報を取得
  const masterRows = getSheet(SHEET.MASTER).getDataRange().getValues()
  const sanpoRow   = masterRows.find(r => r[2] === '三方哲郎')
  if (!sanpoRow) { Logger.log('三方哲郎が講師マスタに見つかりません'); return }
  const staffId = sanpoRow[1]
  const grade   = sanpoRow[3]
  Logger.log(`三方哲郎 staffId: ${staffId} grade: ${grade}`)

  // ── 打刻ログ（5日分 × 出勤・退勤 = 10件）現在の締め期間内 ──
  const clockSheet = getSheet(SHEET.CLOCK)
  const workDays = [
    { date: '2026-04-22', in: '14:00', out: '20:30' },
    { date: '2026-04-24', in: '15:00', out: '21:00' },
    { date: '2026-04-26', in: '14:30', out: '20:00' },
    { date: '2026-04-28', in: '15:00', out: '21:30' },
    { date: '2026-04-30', in: '14:00', out: '20:30' },
  ]
  workDays.forEach(d => {
    clockSheet.appendRow([new Date(), staffId, '三方哲郎', '出勤', d.date, d.in, '', '', '自転車', 0, ''])
    clockSheet.appendRow([new Date(), staffId, '三方哲郎', '退勤', d.date, d.out, '', '', '自転車', 0, ''])
  })
  Logger.log('打刻ログ 10件 追加完了')

  // ── 勤務記録ログ（10件）──
  const recSheet = getSheet(SHEET.RECORD)
  const lessons = [
    { date: '2026-04-22', type: 'MM 1:1',          grade: '中学生', target: '山田 一郎', amount: 1,    unit: 'コマ', V: 2.33 },
    { date: '2026-04-22', type: '自立',              grade: '高校生', target: '',         amount: 1,    unit: 'h',   V: 2.33 },
    { date: '2026-04-24', type: 'MM 1:1',          grade: '小学生', target: '田中 花子', amount: 1,    unit: 'コマ', V: 2.67 },
    { date: '2026-04-24', type: '一斉少人数(1〜8名)', grade: '中学生', target: '中2A数学', amount: 1.5,  unit: 'h',   V: 2.67 },
    { date: '2026-04-26', type: 'MM 1:2',          grade: '中学生', target: '佐藤 次郎', amount: 1,    unit: 'コマ', V: 2.33 },
    { date: '2026-04-26', type: '補習 or 事務',     grade: '',       target: '',         amount: 0.25, unit: 'h',   V: 2.33 },
    { date: '2026-04-28', type: 'MM 1:1',          grade: '高校生', target: '鈴木 三郎', amount: 2,    unit: 'コマ', V: 3.67 },
    { date: '2026-04-28', type: '自立',              grade: '中学生', target: '',         amount: 1,    unit: 'h',   V: 3.67 },
    { date: '2026-04-30', type: 'MM 1:1',          grade: '中学生', target: '高橋 四郎', amount: 1,    unit: 'コマ', V: 2.33 },
    { date: '2026-04-30', type: '一斉少人数(1〜8名)', grade: '高校生', target: '高3B英語', amount: 1.5,  unit: 'h',   V: 2.33 },
  ]
  lessons.forEach(l => {
    recSheet.appendRow([
      new Date(), staffId, '三方哲郎', l.date,
      l.type, l.grade, l.target, l.amount, l.unit,
      workDays.find(d => d.date === l.date)?.in || '',
      workDays.find(d => d.date === l.date)?.out || '',
      l.V,
    ])
  })
  Logger.log('勤務記録ログ 10件 追加完了')

  // ── 給与履歴（過去3ヶ月分）──
  const histSheet = ss.getSheetByName('給与履歴')
  if (!histSheet) { Logger.log('給与履歴シートが見つかりません'); return }
  const history = [
    { start: '2025/11/21', end: '2025/12/20', lesson: 18500, transport: 0, chief: 0, total: 18500, days: 8  },
    { start: '2025/12/21', end: '2026/1/20',  lesson: 22000, transport: 0, chief: 0, total: 22000, days: 10 },
    { start: '2026/1/21',  end: '2026/2/20',  lesson: 19800, transport: 0, chief: 0, total: 19800, days: 9  },
  ]
  history.forEach(h => {
    histSheet.appendRow([h.start, h.end, staffId, '三方哲郎', grade, h.lesson, h.transport, h.chief, h.total, h.days, new Date()])
  })
  Logger.log('給与履歴 3件 追加完了')

  Logger.log('=== 三方哲郎テストデータ作成完了 ===')
}
