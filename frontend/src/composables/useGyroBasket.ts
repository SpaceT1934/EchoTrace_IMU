import { ref } from 'vue'

/**
 * 陀螺仪收纳筐 composable
 *
 * 通过 DeviceOrientation API 读取手机左右倾斜角度（gamma），
 * 映射为收纳筐在屏幕底部的水平位置。
 *
 * 使用方式：
 *   const { basketX, hasGyro, isActive, start, stop } = useGyroBasket()
 *   start()  → 开始监听陀螺仪
 *   basketX  → 0~100（百分比，左→右）
 */

const SMOOTHING = 0.45 // 平滑系数

export function useGyroBasket() {
  const basketX = ref(50) // 0-100，50=居中
  const hasGyro = ref(false)
  const isActive = ref(false)
  const error = ref<string | null>(null)

  let smoothGamma = 0
  let handler: ((e: DeviceOrientationEvent) => void) | null = null

  function onOrientation(e: DeviceOrientationEvent) {
    // gamma: 左右倾斜，范围约 -90（左倾）~  +90（右倾）
    const gamma = e.gamma ?? 0

    // iOS 和某些 Android 初始需要校准：首次事件记录为基准
    // 简单处理：gamma 0 居中
    smoothGamma = smoothGamma * (1 - SMOOTHING) + gamma * SMOOTHING

    // 映射：gamma -45~45 → basketX 0~100
    // clamp 到合理范围
    const clamped = Math.max(-50, Math.min(50, smoothGamma))
    basketX.value = 50 + clamped // -50 → 0%, 0 → 50%, +50 → 100%
  }

  function start() {
    if (isActive.value) return

    if (typeof DeviceOrientationEvent !== 'undefined') {
      // iOS 13+ 需要请求权限
      if (
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        ;(DeviceOrientationEvent as any)
          .requestPermission()
          .then((state: string) => {
            if (state === 'granted') {
              handler = onOrientation
              window.addEventListener('deviceorientation', handler)
              hasGyro.value = true
              isActive.value = true
            } else {
              error.value = '陀螺仪权限被拒绝'
            }
          })
          .catch(() => {
            error.value = '陀螺仪权限请求失败'
          })
      } else {
        // Android / 普通浏览器：直接监听
        handler = onOrientation
        window.addEventListener('deviceorientation', handler)
        hasGyro.value = true
        isActive.value = true
      }
    } else {
      error.value = '当前设备不支持陀螺仪'
    }
  }

  function stop() {
    if (handler) {
      window.removeEventListener('deviceorientation', handler)
      handler = null
    }
    isActive.value = false
  }

  return { basketX, hasGyro, isActive, error, start, stop }
}
