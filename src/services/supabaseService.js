import { supabase } from '../lib/supabase'

const BRANCH = import.meta.env.VITE_BRANCH_NAME || '不明'

export async function sbWriteAttendance({ staffId, name, type, timestamp, location, commuteLabel = '', commuteAllowance = 0, reason = '' }) {
  const { error } = await supabase.from('juku_attendance').insert({
    staff_id: staffId,
    name,
    type,
    timestamp,
    location: location || null,
    commute_label: commuteLabel,
    commute_allowance: commuteAllowance,
    reason,
    branch: BRANCH,
  })
  if (error) throw error
}

export async function sbWriteReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }) {
  const { error } = await supabase.from('juku_reports').insert({
    staff_id: staffId,
    name,
    date,
    lessons,
    clock_in_time: clockInTime || '',
    clock_out_time: clockOutTime || '',
    v: V || 0,
    branch: BRANCH,
  })
  if (error) throw error
}

export async function sbWriteSession(staffId, date, minExitDate) {
  const { error } = await supabase.from('juku_sessions').insert({
    staff_id: staffId,
    date,
    min_exit_date: minExitDate ? minExitDate.toISOString() : null,
  })
  if (error) throw error
}
