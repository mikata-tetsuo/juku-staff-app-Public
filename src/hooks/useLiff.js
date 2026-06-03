import { useState, useEffect } from 'react'
import { initLiff } from '../services/liffService'
import { fetchStaffByLineId } from '../services/mockApi'
import { upsertStaff } from '../services/firestoreService'

export function useLiff() {
  const [state, setState] = useState({
    loading: true,
    lineProfile: null,
    staff: null,
    error: null,
  })

  useEffect(() => {
    async function init() {
      try {
        const profile = await initLiff()
        if (!profile) return // ログインリダイレクト中

        const staff = await fetchStaffByLineId(profile.userId)
        if (staff) {
          upsertStaff(staff.staffId, staff.name, profile.userId).catch(console.warn)
        }
        setState({ loading: false, lineProfile: profile, staff, error: null })
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: err.message }))
      }
    }
    init()
  }, [])

  return state
}
