<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import { useGameSoundscape } from '../composables/useGameSoundscape';
import { useGyroBasket } from '../composables/useGyroBasket';
import type { KitchenItem } from '../types/game';

const router = useRouter();
const gameStore = useGameStore();
const { activeItems, offeredIds, resume: resumeSoundscape, dispose: disposeSoundscape } = useGameSoundscape();
const basket = useGyroBasket();
const { basketX } = basket;

const GAME_DURATION = 60;

interface FallingItem {
  uid: number;
  item: KitchenItem;
  left: number;
  laneIdx: number;
  duration: number;
  rotate: number;
  spawnedAt: number;
  state: 'falling' | 'correct' | 'wrong';
  isTarget: boolean; // 出生时标定，终身不变：true=目标，false=干扰
}

const fallingItems = ref<FallingItem[]>([]);
const collected = ref<KitchenItem[]>([]);
const correctCount = ref(0);
const wrongCount = ref(0);
const remaining = ref(GAME_DURATION);

// 实时分数：正确次数 ×10 + 收集种类 × 准确率(%) ×0.1 - 错误次数 ×8
const score = computed(() => {
  const total = correctCount.value + wrongCount.value;
  const accuracyPct = total > 0 ? Math.round((correctCount.value / total) * 100) : 0;
  return Math.max(0, Math.round(
    correctCount.value * 10 + collected.value.length * accuracyPct * 0.1 - wrongCount.value * 8,
  ));
});
const isOver = ref(false);
const isReady = ref(false);
const isStarted = ref(false); // 等用户点击"开始"才启动一切
const isShaking = ref(false); // 点错时屏幕震动
const gamePage = ref<HTMLElement | null>(null);

interface Explosion {
  uid: number;
  x: number;
  y: number;
  particles: { angle: number; dist: number; delay: number }[];
}
const explosions = ref<Explosion[]>([]);
let explosionSeq = 0;
let shakeTimer: number | undefined;

let uidSeq = 0;
let spawnTimer: number | undefined;
let countdownTimer: number | undefined;
let cueTimer: number | undefined;
let offeredCheckTimer: number | undefined;
const fallPool = computed<KitchenItem[]>(() => [...gameStore.selectedItems, ...gameStore.distractors]);
const totalKinds = computed(() => gameStore.selectedItems.length);
const activeIds = computed(() => new Set(activeItems.value.map((i) => i.id)));

// ---- 切换音效时屏幕浮现提示词 ----
const cueText = ref('');
const cueVisible = ref(false);

watch(activeItems, (items) => {
  if (!items || items.length === 0) return;
  const count = items.length;
  const hints = [
    '仔细听…分辨这个声音',
    '声音变多了，集中注意力',
    '难度提升！三个声音同时响',
  ];
  cueText.value = hints[Math.min(count - 1, hints.length - 1)];
  cueVisible.value = true;
  if (cueTimer) window.clearTimeout(cueTimer);
  cueTimer = window.setTimeout(() => { cueVisible.value = false; }, 4000);

  // 声音响起 → 每个发声物品各掉落一个（isTarget=true）
  if (isStarted.value && !isOver.value) {
    for (const item of items) {
      if (item.soundPath) pushFalling(item, true);
    }
  }
});

// 分轨:两条宽轨，水平最多同时 2 个物品，筐左右移动不撞
const LANE_POSITIONS = [28, 72];
const LANE_COUNT = LANE_POSITIONS.length;

function pickLane(): number | null {
  // 收集当前所有掉落中物品占用的轨道
  const occupied = new Set(
    fallingItems.value
      .filter((f) => f.state === 'falling')
      .map((f) => f.laneIdx),
  );
  // 找空闲轨道
  const free: number[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (free.length === 0) return null; // 全忙，不生成
  // 随机选一个空闲道
  const idx = free[Math.floor(Math.random() * free.length)];
  return idx;
}

// 平滑加速：用已过时间比例插值，从舒缓到紧张
const T_START = 0.08   // 开局已过比例（开局就当过了 8%，不是从零开始，得留缓冲）
const ELAPSED = () => (GAME_DURATION - remaining.value) / GAME_DURATION
const LERP = (a: number, b: number, t: number) => a + (b - a) * t

function getPhaseConfig(): { interval: number; itemDuration: number; activeBias: number } {
  // t 从 ~0.08 平滑到 1.0，开局舒缓、末尾密集
  const t = Math.max(0, Math.min(1, (ELAPSED() - T_START) / (1 - T_START)))
  return {
    interval: Math.round(LERP(900, 260, t)),
    itemDuration: LERP(2.8, 1.1, t),
    activeBias: LERP(0.65, 0.50, t),
  }
}

// 只生成干扰项（目标由声音触发，见 watch(activeItems)）
function spawnDistractor() {
  if (isOver.value) return;
  // 50% 概率出干扰项，50% 不生成（避免满屏干扰）
  if (Math.random() > 0.5) return;
  const distractors = fallPool.value.filter((i) => !i.soundPath);
  if (distractors.length === 0) return;
  const item = distractors[Math.floor(Math.random() * distractors.length)];
  pushFalling(item, false);
}

// 把指定物品作为掉落物加入屏幕
// isTarget=true：发声物品（接了是对的），isTarget=false：干扰项（接了爆炸）
function pushFalling(item: KitchenItem, isTarget = false) {
  const lane = pickLane();
  if (lane === null) return;
  const cfg = getPhaseConfig();
  const left = LANE_POSITIONS[lane] + (Math.random() - 0.5) * 6;
  fallingItems.value.push({
    uid: uidSeq++,
    item,
    left: Math.max(2, Math.min(92, left)),
    laneIdx: lane,
    duration: cfg.itemDuration + Math.random() * 0.6,
    rotate: -14 + Math.random() * 28,
    spawnedAt: performance.now(),
    state: 'falling',
    isTarget,
  });
}

function removeFalling(uid: number) {
  const i = fallingItems.value.findIndex((f) => f.uid === uid);
  if (i !== -1) fallingItems.value.splice(i, 1);
}

// 点错时触发：爆炸粒子 + 屏幕震动 + 手机马达
function triggerExplosion(clientX: number, clientY: number) {
  const rect = gamePage.value?.getBoundingClientRect();
  const x = rect ? clientX - rect.left : clientX;
  const y = rect ? clientY - rect.top : clientY;

  const uid = explosionSeq++;
  const count = 10;
  const particles = Array.from({ length: count }, (_, i) => ({
    angle: (360 / count) * i + (Math.random() * 20 - 10),
    dist: 46 + Math.random() * 34,
    delay: Math.random() * 40,
  }));
  explosions.value.push({ uid, x, y, particles });
  window.setTimeout(() => {
    const idx = explosions.value.findIndex((e) => e.uid === uid);
    if (idx !== -1) explosions.value.splice(idx, 1);
  }, 700);

  // 屏幕震动
  isShaking.value = true;
  if (shakeTimer) window.clearTimeout(shakeTimer);
  shakeTimer = window.setTimeout(() => {
    isShaking.value = false;
  }, 400);

  // 手机马达震动（Android Chrome 支持；iOS Safari 不支持）
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    // 用模式数组（震-停-震），比单值更容易被部分机型触发
    navigator.vibrate([0, 90, 40, 90]);
  }
}

// 筐碰撞：isTarget 出生时就定了，声音只是告诉你"谁在掉"
function catchItemCollision(uid: number, clientX: number, clientY: number) {
  if (isOver.value) return;
  const fall = fallingItems.value.find((f) => f.uid === uid);
  if (!fall || fall.state !== 'falling') return;

  const isCorrect = fall.isTarget;

  if (isCorrect) {
    fall.state = 'correct';
    correctCount.value += 1;
    if (!collected.value.some((c) => c.id === fall.item.id)) {
      collected.value.push(fall.item);
    }
    window.setTimeout(() => removeFalling(uid), 260);
  } else {
    fall.state = 'wrong';
    wrongCount.value += 1;
    triggerExplosion(clientX, clientY);
    const ci = collected.value.findIndex((c) => c.id === fall.item.id);
    if (ci !== -1) collected.value.splice(ci, 1);
    window.setTimeout(() => removeFalling(uid), 360);
  }
}

// 手动点击：只有当前正在发声的才算正确
function catchItem(uid: number, clientX: number, clientY: number) {
  if (isOver.value) return;
  const fall = fallingItems.value.find((f) => f.uid === uid);
  if (!fall || fall.state !== 'falling') return;

  const isCorrect = activeIds.value.has(fall.item.id);

  if (isCorrect) {
    fall.state = 'correct';
    correctCount.value += 1;
    if (!collected.value.some((c) => c.id === fall.item.id)) {
      collected.value.push(fall.item);
    }
    window.setTimeout(() => removeFalling(uid), 260);
  } else {
    fall.state = 'wrong';
    wrongCount.value += 1;
    triggerExplosion(clientX, clientY);
    const ci = collected.value.findIndex((c) => c.id === fall.item.id);
    if (ci !== -1) collected.value.splice(ci, 1);
    window.setTimeout(() => removeFalling(uid), 360);
  }
}

function onFallEnd(uid: number) {
  const fall = fallingItems.value.find((f) => f.uid === uid);
  if (fall && fall.state === 'falling') removeFalling(uid);
}

// ---- 定期检查:将"正在掉落 + 其音效正在播"的物品标记为 offered ----
function checkOffered() {
  if (isOver.value) return;
  const ids = activeIds.value;
  for (const fall of fallingItems.value) {
    if (fall.state === 'falling' && ids.has(fall.item.id)) {
      offeredIds.add(fall.item.id);
    }
  }
}

// ---- 碰撞检测：收纳筐 x 掉落物品 ----
let collisionRaf = 0;
let basketEl: HTMLElement | null = null;
// uid → DOM 映射，避免每帧 querySelector
const itemElMap = new Map<number, HTMLElement>();
let collisionTick = 0; // 降频：每 2 帧做一次检测

function trackItemEl(uid: number, el: HTMLElement | null) {
  if (el) itemElMap.set(uid, el);
  else itemElMap.delete(uid);
}

function checkBasketCollision() {
  if (isOver.value) return;
  if (!basketEl) basketEl = gamePage.value?.querySelector('.basket-target') as HTMLElement | null;
  if (!basketEl) { collisionRaf = requestAnimationFrame(checkBasketCollision); return; }

  // 每 2 帧检测一次，降低 CPU 压力
  collisionTick = (collisionTick + 1) & 1;
  if (collisionTick === 0) {
    const br = basketEl.getBoundingClientRect();
    for (const fall of fallingItems.value) {
      if (fall.state !== 'falling') continue;
      const el = itemElMap.get(fall.uid);
      if (!el) continue;
      const fr = el.getBoundingClientRect();
      // 最少下落 300ms 后才允许碰撞，避免新生即被抓
      if (performance.now() - fall.spawnedAt < 300) continue;
      if (
        fr.left + fr.width / 2 > br.left &&
        fr.left + fr.width / 2 < br.right &&
        fr.top + fr.height / 2 > br.top &&
        fr.top + fr.height / 2 < br.bottom
      ) {
        catchItemCollision(fall.uid, br.left + br.width / 2, br.top + br.height / 2);
      }
    }
  }

  collisionRaf = requestAnimationFrame(checkBasketCollision);
}

function endGame() {
  if (isOver.value) return;
  isOver.value = true;
  if (spawnTimer) window.clearInterval(spawnTimer);
  if (countdownTimer) window.clearInterval(countdownTimer);
  if (offeredCheckTimer) window.clearInterval(offeredCheckTimer);
  if (collisionRaf) cancelAnimationFrame(collisionRaf);
  disposeSoundscape();
  basket.stop();
  fallingItems.value = [];

  // 结算并跳转结算页
  const totalAttempts = correctCount.value + wrongCount.value;
  gameStore.saveResult({
    score: score.value,
    correctCount: correctCount.value,
    wrongCount: wrongCount.value,
    totalAttempts,
    accuracy: totalAttempts > 0 ? Math.round((correctCount.value / totalAttempts) * 100) : 0,
    totalKinds: totalKinds.value,
    placedItems: [...collected.value],
  });

  window.setTimeout(() => {
    void router.push({ name: 'result' });
  }, 700);
}

function goBack() {
  void router.push({ name: 'login' });
}

function startPlaying() {
  isReady.value = true;

  // 目标由声音触发（watch activeItems），这里只补干扰项
  function scheduleNext() {
    if (isOver.value) return;
    spawnDistractor();
    const cfg = getPhaseConfig();
    spawnTimer = window.setTimeout(scheduleNext, cfg.interval);
  }
  scheduleNext();

  offeredCheckTimer = window.setInterval(checkOffered, 1200);

  // 启动碰撞检测（收纳筐 vs 掉落物品）
  collisionRaf = requestAnimationFrame(checkBasketCollision);

  countdownTimer = window.setInterval(() => {
    remaining.value = Math.max(remaining.value - 1, 0);
    if (remaining.value <= 0) endGame();
  }, 1000);
}

function decodeImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    const done = () => resolve();
    if (typeof img.decode === 'function') {
      img.decode().then(done).catch(done);
    } else {
      img.onload = done;
      img.onerror = done;
    }
  });
}

function userStartGame() {
  if (isStarted.value) return;
  isStarted.value = true;
  resumeSoundscape();
  startPlaying();
  // 启动陀螺仪收纳筐（失败则静默回退到触屏模式）
  basket.start();
}

onMounted(() => {
  // 立即显示「开始游戏」按钮，不等待图片解码
  isReady.value = true;

  // 后台异步解码图片，不阻塞用户操作
  const sources = fallPool.value.map((i) => i.image);
  Promise.all(sources.map(decodeImage)).catch(() => {
    /* 解码失败不影响游戏 */
  });
});

onBeforeUnmount(() => {
  if (spawnTimer) window.clearInterval(spawnTimer);
  if (countdownTimer) window.clearInterval(countdownTimer);
  if (cueTimer) window.clearTimeout(cueTimer);
  if (offeredCheckTimer) window.clearInterval(offeredCheckTimer);
  if (shakeTimer) window.clearTimeout(shakeTimer);
  if (collisionRaf) cancelAnimationFrame(collisionRaf);
  disposeSoundscape();
  basket.stop();
});
</script>

<template>
  <main ref="gamePage" class="game-page" :class="{ shaking: isShaking }">
    <div class="game-overlay" aria-hidden="true"></div>

    <transition name="over-fade">
      <div v-if="!isReady && !isOver" class="game-loading" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong>准备中…</strong>
      </div>
      <div v-else-if="isReady && !isStarted && !isOver" class="game-loading" aria-live="polite">
        <button class="start-game-btn" type="button" @click="userStartGame">
          <span class="btn-icon" aria-hidden="true">▶</span>
          <strong>点击开始游戏</strong>
          <small>倾斜手机，用收纳筐接住正在响的厨具</small>
          <small class="start-note">（注意：有可能有多个声音在响哦！）</small>
        </button>
      </div>
    </transition>

    <transition name="cue-fade">
      <div v-if="cueVisible && !isOver" class="sound-cue" aria-live="polite">
        <strong>{{ cueText }}</strong>
      </div>
    </transition>

    <header class="game-hud">
      <button class="hud-back" type="button" aria-label="返回" @click="goBack">‹</button>
      <div class="hud-timer" :class="{ urgent: remaining <= 10 }">
        <span>剩余</span>
        <strong>{{ remaining }}s</strong>
      </div>
      <div class="hud-stat">
        <span>✓</span>
        <strong>{{ correctCount }}</strong>
      </div>
      <div class="hud-stat wrong">
        <span>✗</span>
        <strong>{{ wrongCount }}</strong>
      </div>
      <div class="hud-score">
        <span>得分</span>
        <strong>{{ score }}</strong>
      </div>
    </header>

    <section class="fall-area" aria-label="掉落的厨具">
      <button
        v-for="fall in fallingItems"
        :key="fall.uid"
        :ref="(el) => trackItemEl(fall.uid, el as HTMLElement | null)"
        class="falling-item"
        :data-uid="fall.uid"
        type="button"
        :style="{
          left: `${fall.left}%`,
          animationDuration: `${fall.duration}s`,
          '--rotate': `${fall.rotate}deg`,
        }"
        :class="fall.state"
        :aria-label="fall.item.name"
        @pointerdown.prevent="catchItem(fall.uid, ($event as PointerEvent).clientX, ($event as PointerEvent).clientY)"
        @animationend="onFallEnd(fall.uid)"
      >
        <img :src="fall.item.image" :alt="fall.item.name" draggable="false" />
      </button>
    </section>

    <div class="tray-zone" aria-label="收集托盘">
      <transition-group name="drop-in" tag="div" class="tray-bowl">
        <span v-for="item in collected" :key="item.id" class="tray-item">
          <img :src="item.image" :alt="item.name" draggable="false" />
        </span>
      </transition-group>
    </div>

    <!-- 点错爆炸特效 -->
    <div
      v-for="ex in explosions"
      :key="ex.uid"
      class="explosion"
      :style="{ left: `${ex.x}px`, top: `${ex.y}px` }"
      aria-hidden="true"
    >
      <span class="ex-flash"></span>
      <span class="ex-ring"></span>
      <span
        v-for="(p, i) in ex.particles"
        :key="i"
        class="ex-particle"
        :style="{
          '--angle': `${p.angle}deg`,
          '--dist': `${p.dist}px`,
          animationDelay: `${p.delay}ms`,
        }"
      ></span>
      <span class="ex-boom">💥</span>
    </div>

    <!-- 陀螺仪收纳筐：手机倾斜控制左右移动 -->
    <div
      v-if="isStarted"
      ref="basketRef"
      class="basket-target"
      :style="{ left: `${basketX}%` }"
    >
      <span class="basket-body">
        <span class="basket-rim"></span>
        <span class="basket-glow"></span>
      </span>
    </div>

  </main>
</template>

<style scoped>
.game-page {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: min(100%, 430px);
  min-height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
  background: url('/scenes/game_background.png');
  background-color: #cdeef6;
  background-position: center;
  background-size: cover;
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.34);
}

/* 点错屏幕震动 */
.game-page.shaking {
  animation: screen-shake 400ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes screen-shake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-6px, 3px) rotate(-0.6deg); }
  20% { transform: translate(7px, -4px) rotate(0.6deg); }
  35% { transform: translate(-8px, 2px) rotate(-0.5deg); }
  50% { transform: translate(6px, 4px) rotate(0.4deg); }
  65% { transform: translate(-5px, -3px) rotate(-0.3deg); }
  80% { transform: translate(4px, 2px) rotate(0.2deg); }
}

/* 点错爆炸特效 */
.explosion {
  position: absolute;
  z-index: 8;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ex-flash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 245, 180, 0.95) 0%, rgba(255, 150, 50, 0.7) 40%, transparent 70%);
  animation: ex-flash 360ms ease-out forwards;
}

.ex-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  transform: translate(-50%, -50%);
  border: 3px solid rgba(255, 120, 60, 0.85);
  border-radius: 50%;
  animation: ex-ring 520ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}

.ex-particle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe27a, #ff5a2c 70%);
  box-shadow: 0 0 6px rgba(255, 110, 50, 0.8);
  transform: translate(-50%, -50%);
  animation: ex-particle 560ms cubic-bezier(0.15, 0.6, 0.3, 1) forwards;
}

.ex-boom {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.4);
  font-size: 42px;
  line-height: 1;
  animation: ex-boom 480ms ease-out forwards;
}

@keyframes ex-flash {
  0% { opacity: 1; transform: translate(-50%, -50%) scale(0.4); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
}

@keyframes ex-ring {
  0% { opacity: 0.9; width: 20px; height: 20px; border-width: 4px; }
  100% { opacity: 0; width: 140px; height: 140px; border-width: 1px; }
}

@keyframes ex-particle {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%)
      rotate(var(--angle)) translateX(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%)
      rotate(var(--angle)) translateX(var(--dist)) scale(0.3);
  }
}

@keyframes ex-boom {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(-12deg); }
  35% { opacity: 1; transform: translate(-50%, -50%) scale(1.25) rotate(6deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5) rotate(0deg); }
}

@media (prefers-reduced-motion: reduce) {
  .game-page.shaking {
    animation: none;
  }
}

.game-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(120, 210, 235, 0.12), transparent 40%);
}

.sound-cue {
  position: absolute;
  top: 14%;
  left: 50%;
  z-index: 4;
  transform: translateX(-50%);
  padding: 14px 32px;
  border-radius: 16px;
  background: rgba(20, 42, 52, 0.88);
  color: #fff;
  text-align: center;
  white-space: nowrap;
  box-shadow:
    0 0 24px rgba(255, 210, 74, 0.3),
    0 10px 28px rgba(15, 40, 50, 0.45);
  pointer-events: none;
}

.sound-cue strong {
  font-size: 21px;
  font-weight: 900;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.2);
}

.cue-fade-enter-active {
  transition:
    transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 320ms ease;
}

.cue-fade-leave-active {
  transition:
    transform 300ms ease,
    opacity 300ms ease;
}

.cue-fade-enter-from {
  transform: translateX(-50%) translateY(-14px) scale(0.86);
  opacity: 0;
}

.cue-fade-leave-to {
  transform: translateX(-50%) translateY(-10px);
  opacity: 0;
}

.game-hud {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: max(14px, env(safe-area-inset-top)) 14px 8px;
}

.hud-back {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  background: rgba(58, 120, 140, 0.55);
  color: #fff;
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
}

.hud-timer {
  display: grid;
  justify-items: center;
  gap: 1px;
  margin-left: auto;
  border-radius: 14px;
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.9);
  color: #1f7a52;
}

.hud-timer.urgent {
  color: #d2402a;
  background: rgba(255, 233, 228, 0.95);
}

.hud-timer span {
  font-size: 10px;
  font-weight: 700;
}

.hud-timer strong {
  font-size: 22px;
  line-height: 1;
}

.hud-stat {
  display: grid;
  justify-items: center;
  gap: 1px;
  border-radius: 14px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.82);
  color: #2c6b7d;
  box-shadow: 0 4px 12px rgba(33, 80, 95, 0.2);
}

.hud-stat.wrong {
  color: #c85a3c;
}

.hud-stat span {
  font-size: 10px;
  font-weight: 700;
}

.hud-stat strong {
  font-size: 20px;
  line-height: 1;
}

.hud-score {
  display: grid;
  justify-items: center;
  gap: 1px;
  margin-left: auto;
  border-radius: 14px;
  padding: 5px 14px;
  background: linear-gradient(135deg, rgba(255, 220, 80, 0.35), rgba(255, 180, 40, 0.22));
  color: #9b5a14;
  box-shadow: 0 4px 12px rgba(120, 70, 20, 0.14);
}

.hud-score span {
  font-size: 10px;
  font-weight: 700;
  color: #7a4a18;
}

.hud-score strong {
  font-size: 22px;
  line-height: 1;
  font-weight: 1000;
  color: #d07216;
}

.fall-area {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.falling-item {
  position: absolute;
  top: 0;
  display: grid;
  width: 84px;
  height: 84px;
  place-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  animation-name: fall-down;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
  will-change: transform;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

.falling-item::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 999px;
}

.falling-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  /* 用投影提升在背景上的可读性，替代原来的白色底卡 */
  filter: drop-shadow(0 6px 8px rgba(30, 70, 85, 0.45));
}

/* 点对：绿色发光 + 放大 */
.falling-item.correct {
  animation-play-state: paused;
  transform: scale(1.18);
  transition: transform 200ms ease;
}

.falling-item.correct img {
  filter: drop-shadow(0 0 10px rgba(75, 224, 138, 0.95))
    drop-shadow(0 0 4px rgba(75, 224, 138, 0.9));
}

/* 点错：抖动碎裂 */
.falling-item.wrong {
  animation-play-state: paused;
  animation-name: shatter;
  animation-duration: 360ms;
  animation-timing-function: ease-out;
}

.falling-item.wrong img {
  filter: drop-shadow(0 0 10px rgba(255, 106, 77, 0.9));
}

@keyframes fall-down {
  0% {
    transform: translateY(-90px) rotate(var(--rotate, 0deg));
  }
  100% {
    transform: translateY(108dvh) rotate(calc(var(--rotate, 0deg) * -1));
  }
}

@keyframes shatter {
  0% {
    transform: scale(1.1) rotate(0deg);
    opacity: 1;
  }
  25% {
    transform: scale(1.14) rotate(-8deg);
  }
  60% {
    transform: scale(1.14) rotate(8deg);
  }
  100% {
    transform: scale(0.5) rotate(0deg);
    opacity: 0;
  }
}

.tray-zone {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 130px;
  /* 上移约一个图标高度，让物品落进背景图里画的木筐中 */
  padding: 0 12% calc(max(20px, env(safe-area-inset-bottom)) + 42px);
}

.tray-bowl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.tray-item {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  transition: transform 160ms ease;
}

.tray-item:hover {
  transform: scale(1.12);
}

.tray-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.drop-in-enter-active {
  transition:
    transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 280ms ease;
}

.drop-in-enter-from {
  transform: translateY(-30px) scale(0.4);
  opacity: 0;
}

.game-loading {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 14px;
  background: rgba(8, 24, 30, 0.78);
  color: #fff;
  text-align: center;
  backdrop-filter: blur(3px);
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffd24a;
  border-radius: 999px;
  animation: spin 800ms linear infinite;
}

.game-loading strong {
  font-size: 26px;
  font-weight: 900;
}

.loading-tip {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.start-game-btn {
  display: grid;
  justify-items: center;
  gap: 12px;
  border: 0;
  border-radius: 22px;
  padding: 28px 44px;
  background: linear-gradient(180deg, #ffe065, #ffb72d);
  color: #5a3300;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.5),
    0 8px 0 #a95606,
    0 14px 28px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 120ms ease;
}

.start-game-btn:active {
  transform: scale(0.96);
}

.btn-icon {
  font-size: 38px;
  line-height: 1;
}

.start-game-btn strong {
  font-size: 24px;
  font-weight: 1000;
}

.start-game-btn small {
  font-size: 13px;
  color: rgba(90, 51, 0, 0.72);
}

.start-note {
  font-size: 11px !important;
  color: rgba(90, 51, 0, 0.48) !important;
  margin-top: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.over-fade-enter-active {
  transition: opacity 360ms ease;
}

.over-fade-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .falling-item {
    animation-timing-function: ease-in;
  }
}

/* ---- 陀螺仪收纳筐 ---- */
.basket-target {
  position: absolute;
  bottom: 100px;
  z-index: 5;
  width: 100px;
  height: 72px;
  transform: translateX(-50%);
  pointer-events: none;
  will-change: left;
}

.basket-body {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.basket-rim {
  position: absolute;
  inset: 0;
  border: 4px solid rgba(255, 190, 60, 0.9);
  border-top: none;
  border-radius: 0 0 22px 22px;
  background: linear-gradient(180deg,
    rgba(255, 220, 90, 0.35) 0%,
    rgba(255, 170, 40, 0.28) 40%,
    rgba(180, 100, 20, 0.18) 100%);
  box-shadow:
    inset 0 8px 16px rgba(255, 240, 180, 0.25),
    0 0 20px rgba(255, 180, 50, 0.4),
    0 4px 12px rgba(100, 50, 10, 0.3);
}

/* 筐上方开口处的高亮弧线 */
.basket-rim::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -4px;
  right: -4px;
  height: 18px;
  border: 4px solid rgba(255, 210, 80, 0.85);
  border-bottom: none;
  border-radius: 22px 22px 0 0;
  background: transparent;
  box-shadow: 0 -4px 12px rgba(255, 190, 50, 0.35);
}

.basket-glow {
  position: absolute;
  inset: 6px;
  border-radius: 0 0 16px 16px;
  background: radial-gradient(ellipse at 50% 0%, rgba(255, 240, 180, 0.2), transparent 70%);
  pointer-events: none;
}

/* 筐被物品碰撞时的微动 */
.basket-target.caught {
  animation: basket-catch 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes basket-catch {
  0% { transform: translateX(-50%) scale(1); }
  40% { transform: translateX(-50%) scale(1.08); }
  100% { transform: translateX(-50%) scale(1); }
}

/* 无陀螺仪时的降级提示 */
.no-gyro-hint {
  position: absolute;
  bottom: 80px;
  left: 50%;
  z-index: 5;
  transform: translateX(-50%);
  border-radius: 12px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
}
</style>
