<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import type { KitchenItem } from '../types/game';

const router = useRouter();
const gameStore = useGameStore();
const remainingSeconds = ref(gameStore.memoryDurationSeconds);
const activeItemIndex = ref(0);
const isSceneHidden = ref(false);
const isReady = ref(false); // 音效预加载完成前不开始轮播
const imageLoaded = ref(false);
const imageFailed = ref(false);
// 预加载的音效对象，按 soundPath 缓存，保证逐个播放时立即出声
const preloaded = new Map<string, HTMLAudioElement>();

let countdownTimer: number | undefined;
let showcaseTimer: number | undefined;
let blackoutTimer: number | undefined;
let navigateTimer: number | undefined;
let isUnmounted = false;

const itemShowcaseMs = computed(() => {
  return Math.floor((gameStore.memoryDurationSeconds * 1000) / gameStore.selectedItems.length);
});

const activeItem = computed<KitchenItem>(() => {
  return gameStore.selectedItems[activeItemIndex.value] ?? gameStore.selectedItems[0];
});

function stopAudio() {
  // 暂停所有预加载音效（轮播是顺序的，停掉上一个）
  for (const a of preloaded.values()) {
    if (!a.paused) {
      a.pause();
      a.currentTime = 0;
    }
  }
}

function playItemSound(item: KitchenItem) {
  stopAudio();

  if (!item.soundPath) {
    return;
  }

  const a = preloaded.get(item.soundPath);
  if (!a) {
    return;
  }
  a.currentTime = 0;
  a.volume = item.volume ?? 1;
  void a.play().catch(() => {
    /* 静默 */
  });
}

// 预加载本局所有厨具音效，缓冲完成后才开始轮播
function preloadSounds(): Promise<void> {
  const paths = [
    ...new Set(gameStore.selectedItems.map((i) => i.soundPath).filter((p): p is string => !!p)),
  ];

  return Promise.all(
    paths.map(
      (src) =>
        new Promise<void>((resolve) => {
          const a = new Audio();
          a.src = src;
          a.preload = 'auto';
          const done = () => {
            preloaded.set(src, a);
            resolve();
          };
          // canplay 比 canplaythrough 快得多：只要能开始播就触发，不用等整段缓冲完
          a.addEventListener('canplay', done, { once: true });
          a.addEventListener('error', () => resolve(), { once: true });
          a.load();
          setTimeout(done, 2000); // 超时兜底，不无限等待
        }),
    ),
  ).then(() => undefined);
}

function startShowcase() {
  isReady.value = true;

  playItemSound(activeItem.value);

  countdownTimer = window.setInterval(() => {
    remainingSeconds.value = Math.max(remainingSeconds.value - 1, 0);
  }, 1000);

  showcaseTimer = window.setInterval(showNextItem, itemShowcaseMs.value);

  blackoutTimer = window.setTimeout(() => {
    isSceneHidden.value = true;
    stopAudio();

    if (countdownTimer) {
      window.clearInterval(countdownTimer);
    }
    if (showcaseTimer) {
      window.clearInterval(showcaseTimer);
    }

    // 黑屏短暂停留后进入听音挑战（游戏）页
    navigateTimer = window.setTimeout(() => {
      void router.push({ name: 'game' });
    }, 1600);
  }, gameStore.memoryDurationSeconds * 1000);
}

function showNextItem() {
  const nextIndex = activeItemIndex.value + 1;

  if (nextIndex >= gameStore.selectedItems.length) {
    if (showcaseTimer) {
      window.clearInterval(showcaseTimer);
    }

    return;
  }

  activeItemIndex.value = nextIndex;
  playItemSound(activeItem.value);
}

onMounted(async () => {
  await preloadSounds();
  if (isUnmounted) {
    return;
  }
  startShowcase();
});

onBeforeUnmount(() => {
  isUnmounted = true;
  stopAudio();

  // 彻底销毁本页所有音效对象
  for (const a of preloaded.values()) {
    try { a.pause(); } catch { /* ignore */ }
    try { a.currentTime = 0; } catch { /* ignore */ }
    try { a.removeAttribute('src'); a.load(); } catch { /* ignore */ }
  }
  preloaded.clear();

  if (countdownTimer) {
    window.clearInterval(countdownTimer);
  }

  if (showcaseTimer) {
    window.clearInterval(showcaseTimer);
  }

  if (blackoutTimer) {
    window.clearTimeout(blackoutTimer);
  }

  if (navigateTimer) {
    window.clearTimeout(navigateTimer);
  }
});
</script>

<template>
  <main class="memory-page" :class="{ 'is-hidden': isSceneHidden }">
    <header class="memory-header">
      <div class="memory-title-block">
        <p class="eyebrow"><span>01</span> 记忆阶段</p>
        <h1>请快速记住图中物品的声音！</h1>
      </div>
      <div class="countdown" aria-live="polite" aria-label="剩余记忆时间">
        <span class="alarm-bell left" aria-hidden="true"></span>
        <span class="alarm-bell right" aria-hidden="true"></span>
        <strong>{{ remainingSeconds }}</strong>
        <span class="countdown-unit">秒</span>
        <span class="alarm-foot left" aria-hidden="true"></span>
        <span class="alarm-foot right" aria-hidden="true"></span>
      </div>
    </header>

    <section class="kitchen-stage" aria-label="厨房记忆场景">
      <img
        class="scene-image"
        :class="{ 'is-ready': imageLoaded && !imageFailed }"
        :src="gameStore.sceneImagePath"
        alt="厨房记忆场景"
        @load="imageLoaded = true"
        @error="imageFailed = true"
      />

      <div v-if="imageFailed" class="scene-placeholder">
        <span>厨房场景图</span>
        <small>请放到 frontend/public/scenes/kitchen-memory.png</small>
      </div>

      <button
        v-for="(item, index) in gameStore.selectedItems"
        :key="item.id"
        class="memory-item"
        :class="{ active: index === activeItemIndex }"
        :style="{ left: `${item.x}%`, top: `${item.y}%` }"
        type="button"
        :aria-label="item.name"
      >
        <span>{{ item.emoji }}</span>
        <strong>{{ item.name }}</strong>
      </button>
    </section>

    <footer class="memory-footer" aria-live="polite">
      <span class="listening-icon" aria-hidden="true">
        <i></i>
      </span>
      <span class="sound-copy">
        <small>正在播放</small>
        <strong>{{ activeItem.name }}</strong>
      </span>
    </footer>

    <div v-if="isSceneHidden" class="blackout" aria-live="assertive">
      <div class="blackout-card">
        <span class="blackout-kicker">声音线索已封存</span>
        <div class="blackout-record" aria-hidden="true">
          <span class="record-disc"></span>
          <span class="record-arm"></span>
        </div>
        <strong>记忆结束</strong>
        <span class="blackout-progress">进入听音挑战</span>
      </div>
    </div>

    <div v-if="!isReady && !isSceneHidden" class="memory-loading" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <strong>音效加载中…</strong>
    </div>
  </main>
</template>
