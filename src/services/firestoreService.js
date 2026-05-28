import { db } from '../lib/firebase'
import { collection, addDoc, doc, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore'

const BRANCH = import.meta.env.VITE_BRANCH_NAME || '不明'

export async function writeAttendance({ staffId, name, type, timestamp, location, commuteLabel = '', commuteAllowance = 0, reason = '' }) {
  await addDoc(collection(db, 'attendance'), {
    staffId,
    name,
    type,
    timestamp,
    location: location || null,
    commuteLabel,
    commuteAllowance,
    reason,
    branch: BRANCH,
    createdAt: serverTimestamp(),
  })
}

export async function writeReport({ staffId, name, date, lessons, clockInTime, clockOutTime, V }) {
  const BRANCH = import.meta.env.VITE_BRANCH_NAME || '不明'
  await setDoc(doc(db, 'reports', `${staffId}_${date}`), {
    staffId,
    name,
    date,
    lessons,
    clockInTime: clockInTime || '',
    clockOutTime: clockOutTime || '',
    V: V || 0,
    branch: BRANCH,
    updatedAt: serverTimestamp(),
  })
}

export async function writeSession(staffId, date, minExitDate) {
  await addDoc(collection(db, 'sessions'), {
    staffId,
    date,
    minExitDate: minExitDate ? minExitDate.toISOString() : null,
    createdAt: serverTimestamp(),
  })
}

export async function fetchTodayAttendance(staffId) {
  const todayISO = toLocalDateISO(new Date())

  const [attendanceSnap, sessionSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('staffId', '==', staffId))),
    getDocs(query(collection(db, 'sessions'), where('staffId', '==', staffId), where('date', '==', todayISO))),
  ])

  const todayRecords = attendanceSnap.docs
    .map(d => d.data())
    .filter(r => r.timestamp && toLocalDateISO(new Date(r.timestamp)) === todayISO)

  const sessionDocs = sessionSnap.docs.map(d => d.data())
  const session = sessionDocs.length > 0 ? sessionDocs[sessionDocs.length - 1] : null

  return {
    clockIn:  todayRecords.find(r => r.type === 'in')  || null,
    clockOut: todayRecords.find(r => r.type === 'out') || null,
    session,
  }
}

function toLocalDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
