import { useState, useEffect } from 'react'
import { initLiff } from '../services/liffService'
import { fetchStaffByLineId } from '../services/mockApi'

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
        setState({ loading: false, lineProfile: profile, staff, error: null })
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: err.message }))
      }
    }
    init()
  }, [])

  return state
}
