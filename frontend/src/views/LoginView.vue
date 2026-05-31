<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import { useBackgroundMusic } from '../composables/useBackgroundMusic';
import type { Difficulty } from '../types/game';

const router = useRouter();
const gameStore = useGameStore();
const { dispose: disposeMusic } = useBackgroundMusic();

onBeforeUnmount(() => {
  disposeMusic();
});

interface DifficultyOption {
  id: Difficulty;
  title: string;
  count: string;
  icon: string;
  iconAlt: string;
  stars: number;
  description: string;
}

const difficultyOptions: DifficultyOption[] = [
  {
    id: 'beginner',
    title: '新手简单',
    count: '6个物品',
    icon: '/items/kitchen/wok.png',
    iconAlt: '炒锅',
    stars: 1,
    description: '适合初次体验',
  },
  {
    id: 'normal',
    title: '普通进阶',
    count: '12个物品',
    icon: '/items/kitchen/kettle.png',
    iconAlt: '水壶',
    stars: 2,
    description: '推荐多数玩家',
  },
  {
    id: 'hard',
    title: '困难硬核',
    count: '18个物品',
    icon: '/items/kitchen/pressure_cooker.png',
    iconAlt: '高压锅',
    stars: 3,
    description: '高手极限挑战',
  },
];

function selectDifficulty(difficulty: Difficulty) {
  gameStore.setDifficulty(difficulty);
}

function startGame() {
  gameStore.pickTargets(); // 每局随机抽 6 个目标厨具
  gameStore.setPlayerName('厨房新手');
  void router.push({ name: 'memory' });
}
</script>

<template>
  <main class="login-page">
    <div class="home-overlay" aria-hidden="true"></div>

    <section class="home-content" aria-labelledby="game-title">
      <div class="game-logo">
        <span class="chef-hat" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span class="sound-wave left" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <h1 id="game-title">
          <span>声</span>
          <span>迹</span>
        </h1>
        <span class="sound-wave right" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span class="music-note">♪</span>
      </div>

      <div class="wood-sign">
        <strong>只用耳朵，能还原你记忆里的厨房吗?</strong>
      </div>

      <div class="difficulty-heading">
        <span></span>
        <strong>选择难度</strong>
        <span></span>
      </div>

      <div class="difficulty-grid" aria-label="选择难度">
        <button
          v-for="option in difficultyOptions"
          :key="option.id"
          class="difficulty-card"
          :class="[option.id, { selected: gameStore.difficulty === option.id }]"
          type="button"
          @click="selectDifficulty(option.id)"
        >
          <strong class="difficulty-title">{{ option.title }}</strong>
          <span class="item-count">{{ option.count }}</span>
          <span class="item-illustration">
            <img :src="option.icon" :alt="option.iconAlt" />
          </span>
          <span class="sound-rating" aria-hidden="true">
            <span v-for="index in 3" :key="index" :class="{ lit: index <= option.stars }">✦</span>
          </span>
          <span class="difficulty-desc">{{ option.description }}</span>
        </button>
      </div>

      <button class="start-challenge" type="button" @click="startGame">
        <span>⌁</span>
        <strong>开始挑战</strong>
        <span>⌁</span>
      </button>

      <div class="feature-strip" aria-label="玩法提示">
        <div>
          <span>♬</span>
          <strong>听觉记忆</strong>
          <small>8秒记忆厨具声音</small>
        </div>
        <div>
          <span>▥</span>
          <strong>听音辨物</strong>
          <small>在混音中精准识别</small>
        </div>
        <div>
          <span>🧩</span>
          <strong>还原闯关</strong>
          <small>还原厨房比拼准确度</small>
        </div>
      </div>
    </section>
  </main>
</template>
