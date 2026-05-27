// LIFF初期化・ユーザー情報取得のサービス
// 開発時はDEV_MODEでモックユーザーを返す

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''

export async function initLiff() {
  if (DEV_MODE) {
    return getMockProfile()
  }

  const liff = (await import('@line/liff')).default
  await liff.init({ liffId: LIFF_ID })

  if (!liff.isLoggedIn()) {
    liff.login()
    return null
  }

  const profile = await liff.getProfile()
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}

export async function closeLiff() {
  if (DEV_MODE) return
  const liff = (await import('@line/liff')).default
  liff.closeWindow()
}

function getMockProfile() {
  return {
    userId: 'U_dev_mock_001',
    displayName: '田中 花子（テスト）',
    pictureUrl: null,
  }
}
