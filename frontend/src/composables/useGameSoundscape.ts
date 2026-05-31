import { ref } from 'vue'
import { useGameStore } from '../stores/game'
import type { KitchenItem } from '../types/game'

const BG_VOL = 0.28

// 阶段定义：按已过秒数划分，而非跳变计数
// 0-18s → 1 音，18-38s → 2 音叠加，38-60s → 3 音叠加
const PHASES = [
  { sounds: 1, minSec: 0  },
  { sounds: 2, minSec: 18 },
  { sounds: 3, minSec: 38 },
]

const activeItems = ref<KitchenItem[]>([])
const offeredIds = new Set<string>()

let bg: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let activeNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = []
let fallbackAudios: HTMLAudioElement[] = []
let bufferCache = new Map<string, AudioBuffer>()
let rotTimer: number | undefined
let running = false
let elapsedSec = 0
let tickInterval: number | undefined
const pickCount = new Map<string, number>()

/** 根据已过秒数确定当前阶段 */
function getPhaseCfg(): (typeof PHASES)[number] {
  let cfg = PHASES[0]
  for (const p of PHASES) {
    if (elapsedSec >= p.minSec) cfg = p
  }
  return cfg
}

function ensureCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playLoopSlice(buffer: AudioBuffer, vol: number, loopSec: number): { src: AudioBufferSourceNode; gain: GainNode } {
  const ctx = ensureCtx()
  const gain = ctx.createGain()
  gain.gain.value = vol
  gain.connect(ctx.destination)

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.loopStart = 0
  src.loopEnd = Math.min(loopSec, buffer.duration)
  src.connect(gain)
  src.start(0)

  return { src, gain }
}

/** 安全停止所有活跃节点 */
function stopNodes() {
  for (const node of activeNodes) {
    try { node.src.stop() } catch { /* */ }
    try { node.src.disconnect() } catch { /* */ }
    try { node.gain.disconnect() } catch { /* */ }
  }
  activeNodes = []
  for (const a of fallbackAudios) {
    try { a.pause(); a.currentTime = 0; a.remove() } catch { /* */ }
  }
  fallbackAudios = []
}

/** 启动 HTMLAudio 兜底（AudioContext 挂了时用） */
function playFallback(items: KitchenItem[]) {
  for (const item of items) {
    if (!item.soundPath) continue
    const a = new Audio(item.soundPath)
    a.loop = true
    a.volume = (item.volume ?? 0.6) * 0.8
    a.play().catch(() => {})
    fallbackAudios.push(a)
  }
}

/** 解码音频文件 */
async function loadBuffer(src: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(src)) return bufferCache.get(src)!
  try {
    const ctx = ensureCtx()
    const resp = await fetch(src)
    if (!resp.ok) return null
    const arrayBuf = await resp.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuf)
    bufferCache.set(src, buffer)
    return buffer
  } catch {
    return null
  }
}

/** 公平选择：优先未 offered 的，其次被选少的 */
function pickFair(targets: KitchenItem[], count: number): KitchenItem[] {
  const list = targets.filter((t) => t.soundPath)
  if (list.length === 0) return []

  const exact = Math.min(count, list.length)

  const sorted = [...list].sort((a, b) => {
    const aU = offeredIds.has(a.id) ? 1 : 0
    const bU = offeredIds.has(b.id) ? 1 : 0
    if (aU !== bU) return aU - bU
    return (pickCount.get(a.id) ?? 0) - (pickCount.get(b.id) ?? 0)
  })

  // 从前 exact+2 个里随机抽，保证多样性
  const pool = sorted.slice(0, Math.min(exact + 2, sorted.length))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, exact)

  for (const item of picked) {
    pickCount.set(item.id, (pickCount.get(item.id) ?? 0) + 1)
  }
  return picked
}

/**
 * 无缝切换音效：
 * 关键：先更新 activeItems（碰撞检测绑定），旧声音继续放，
 * 新 buffer 加载完后秒切，全程无静音、无"一切皆错"的间隙。
 */
async function rotate(targets: KitchenItem[]) {
  if (!running) return

  const cfg = getPhaseCfg()
  const count = cfg.sounds
  const picked = pickFair(targets, count)

  // ★ 立即更新 activeItems — 碰撞检测在下一帧就能读到正确的值
  activeItems.value = picked

  // 后台加载新 buffer，旧声音继续播放
  const buffers = await Promise.all(
    picked.map((item) => loadBuffer(item.soundPath as string)),
  )

  // 切声音：停旧、启新
  stopNodes()

  let anyStarted = false
  for (let i = 0; i < picked.length; i++) {
    const buf = buffers[i]
    if (!buf) continue
    const node = playLoopSlice(buf, picked[i].volume ?? 0.6, picked[i].loopSec ?? 1.5)
    activeNodes.push(node)
    anyStarted = true
  }

  if (!anyStarted && picked.length > 0) {
    playFallback(picked)
  }

  rotTimer = window.setTimeout(() => rotate(targets), 1500)
}

async function start(targets: KitchenItem[]) {
  if (running) return

  running = true
  elapsedSec = 0
  pickCount.clear()
  offeredIds.clear()

  // 预加载所有本局音效 buffer（最多 6 个），避免首次旋转时等太久
  const paths = [...new Set(targets.map((i) => i.soundPath).filter((p): p is string => !!p))]
  await Promise.all(paths.map((p) => loadBuffer(p)))

  // 背景乐全程播放
  bg = new Audio(PHASES[0].minSec >= 0 ? '/sounds/背景音乐.m4a' : '/sounds/背景音乐.m4a')
  bg.loop = true
  bg.volume = BG_VOL
  bg.play().catch(() => {})

  // 秒 tick
  tickInterval = window.setInterval(() => {
    if (!running) return
    elapsedSec += 1
  }, 1000)

  await rotate(targets)
}

function stop() {
  running = false
  if (rotTimer) { window.clearTimeout(rotTimer); rotTimer = undefined }
  if (tickInterval) { window.clearInterval(tickInterval); tickInterval = undefined }
  stopNodes()
  if (bg) { bg.pause(); bg.currentTime = 0; bg.remove(); bg = null }
  activeItems.value = []
  elapsedSec = 0
}

export function useGameSoundscape() {
  const store = useGameStore()

  function resume() {
    if (!store.soundEnabled) store.toggleSound()
    start(store.selectedItems)
  }

  function dispose() { stop() }

  return { activeItems, offeredIds, resume, dispose }
}
