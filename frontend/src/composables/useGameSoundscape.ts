import { ref } from 'vue';
import { useGameStore } from '../stores/game';
import type { KitchenItem } from '../types/game';

const BG_VOL = 0.28;

const PHASES = [
  { sounds: 1, min: 4000, max: 5000, groups: 2, bgSrc: '/sounds/背景音乐.m4a' },
  { sounds: 2, min: 9000, max: 11000, groups: 4, bgSrc: '/sounds/背景音乐.m4a' },
  { sounds: 3, min: 9000, max: 11000, groups: 999, bgSrc: '/sounds/背景音乐.m4a' },
];

const activeItems = ref<KitchenItem[]>([]);
const offeredIds = new Set<string>();

let bg: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let activeNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
let bufferCache = new Map<string, AudioBuffer>();
let rotTimer: number | undefined;
let groupIndex = 0;
let running = false;
const pickCount = new Map<string, number>();

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getPhaseInfo(): { index: number; cfg: (typeof PHASES)[number] } {
  let acc = 0;
  for (let i = 0; i < PHASES.length; i++) {
    acc += PHASES[i].groups;
    if (groupIndex < acc) return { index: i, cfg: PHASES[i] };
  }
  return { index: PHASES.length - 1, cfg: PHASES[PHASES.length - 1] };
}

function ensureCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** 只播放前 loopSec 秒的循环音效（用 AudioBuffer 截取，不会有空白间隙） */
function playLoopSlice(buffer: AudioBuffer, vol: number, loopSec: number): { src: AudioBufferSourceNode; gain: GainNode } {
  const ctx = ensureCtx();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  gain.connect(ctx.destination);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = Math.min(loopSec, buffer.duration);
  src.connect(gain);
  src.start(0);

  return { src, gain };
}

function stopNodes() {
  for (const node of activeNodes) {
    try { node.src.stop(); } catch { /* 已停止 */ }
    try { node.src.disconnect(); } catch { /* 忽略 */ }
    try { node.gain.disconnect(); } catch { /* 忽略 */ }
  }
  activeNodes = [];
}

/** 解码音频文件为 AudioBuffer（缓存） */
async function loadBuffer(src: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(src)) return bufferCache.get(src)!;
  try {
    const ctx = ensureCtx();
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const arrayBuf = await resp.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuf);
    bufferCache.set(src, buffer);
    return buffer;
  } catch {
    return null;
  }
}

function pickFair(targets: KitchenItem[], count: number): KitchenItem[] {
  const list = targets.filter((t) => t.soundPath);
  if (list.length === 0) return [];

  const sorted = [...list].sort((a, b) => {
    const aU = offeredIds.has(a.id) ? 1 : 0;
    const bU = offeredIds.has(b.id) ? 1 : 0;
    if (aU !== bU) return aU - bU;
    return (pickCount.get(a.id) ?? 0) - (pickCount.get(b.id) ?? 0);
  });

  const pool = sorted.slice(0, Math.min(count + 3, sorted.length));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(count, pool.length));

  for (const item of picked) {
    pickCount.set(item.id, (pickCount.get(item.id) ?? 0) + 1);
  }
  return picked;
}

async function rotate(targets: KitchenItem[]) {
  if (!running) return;

  groupIndex++;
  const phaseInfo = getPhaseInfo();

  const count = Math.min(phaseInfo.cfg.sounds, targets.filter((t) => t.soundPath).length);
  const picked = pickFair(targets, count);

  stopNodes();
  activeItems.value = [];

  // 预加载本轮音效 buffer，再开始播放
  const buffers = await Promise.all(
    picked.map((item) => loadBuffer(item.soundPath as string)),
  );

  for (let i = 0; i < picked.length; i++) {
    const buf = buffers[i];
    if (!buf) continue;
    const node = playLoopSlice(buf, picked[i].volume ?? 0.6, picked[i].loopSec ?? 1.5);
    activeNodes.push(node);
  }

  activeItems.value = picked;
  rotTimer = window.setTimeout(() => rotate(targets), rand(phaseInfo.cfg.min, phaseInfo.cfg.max));
}

async function start(targets: KitchenItem[]) {
  if (running) return;

  running = true;
  groupIndex = 0;
  pickCount.clear();
  offeredIds.clear();

  // 背景乐全程播放，不随阶段切换
  bg = new Audio(PHASES[0].bgSrc);
  bg.loop = true;
  bg.volume = BG_VOL;
  bg.play().catch(() => {});

  await rotate(targets);
}

function stop() {
  running = false;
  if (rotTimer) {
    window.clearTimeout(rotTimer);
    rotTimer = undefined;
  }
  stopNodes();
  if (bg) {
    bg.pause();
    bg.currentTime = 0;
    bg.remove();
    bg = null;
  }
  activeItems.value = [];
}

export function useGameSoundscape() {
  const store = useGameStore();

  function resume() {
    if (!store.soundEnabled) {
      store.toggleSound();
    }
    start(store.selectedItems);
  }

  function dispose() {
    stop();
  }

  return { activeItems, offeredIds, resume, dispose };
}
