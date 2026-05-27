const BRANCH_LOCATIONS = {
  '西明石': { lat: 34.67070137, lng: 134.9612871 },
}
const JUKU_RADIUS_M = 100

const BRANCH = import.meta.env.VITE_BRANCH_NAME || '西明石'
const JUKU_LOCATION = BRANCH_LOCATIONS[BRANCH] ?? BRANCH_LOCATIONS['西明石']

export async function getLocation() {
  try {
    return await new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, enableHighAccuracy: true, maximumAge: 0 }
      )
    })
  } catch { return null }
}

export function isAwayFromJuku(location) {
  if (!location || typeof location.lat !== 'number') return null
  const d = distanceMeters(location.lat, location.lng, JUKU_LOCATION.lat, JUKU_LOCATION.lng)
  return { distance: d, isAway: d > JUKU_RADIUS_M }
}

export function fmtDistance(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const rad = x => x * Math.PI / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
