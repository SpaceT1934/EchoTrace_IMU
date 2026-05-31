<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import type { GameResult, KitchenItem } from '../types/game';

interface KitchenPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RestoredItemView {
  item: KitchenItem;
  style: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
}

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 844;
const kitchenLayout: Record<string, KitchenPlacement> = {
  microwave: { x: 101, y: 196, width: 72, height: 56 },
  dishes: { x: 103, y: 280, width: 62, height: 50 },
  kitchen_timer: { x: 323, y: 222, width: 32, height: 34 },
  faucet: { x: 50, y: 375, width: 74, height: 118 },
  wok: { x: 200, y: 377, width: 80, height: 70 },
  boiling_pot: { x: 262, y: 380, width: 70, height: 80 },
  ice_cubes_cup: { x: 103, y: 420, width: 34, height: 62 },
  cutting_board: { x: 50, y: 480, width: 122, height: 78 },
  cracking_eggs: { x: 275, y: 542, width: 72, height: 110 },
  popcorn_machine: { x: 354, y: 550, width: 65, height: 100 },
  fruit_peeler: { x: 290, y: 640, width: 58, height: 46 },
};
const stickyNotes = [
  '我很享受人类制造的珍贵的声响',
  '独处时我才能听见自己的声音',
  '一人食的时候就想象自己是孤独的美食家',
  '感受活着的日子',
  '一起做饭是件很浪漫的事情',
  '厨房是我最小单位的精神世界',
  '一个人做饭，是淡淡的浪漫',
  '锅铲声是这个家最日常的BGM',
  '今天的厨房，比昨天更热闹一点点',
  '煎蛋的声音下雨天听起来特别像下暴雨',
  '有烟火气的地方就有家的感觉',
  '水壶鸣叫的那一刻，什么烦恼都先等一等',
];

const router = useRouter();
const route = useRoute();
const gameStore = useGameStore();

// ---- 随机名字生成 ----
const ADJECTIVES = [
  '快乐的', '勇敢的', '好奇的', '温暖的', '闪闪的', '甜甜的', '开心的', '帅气的',
  '可爱的', '聪明的', '机智的', '热情的', '温柔的', '活力的', '好运的', '幸运的',
  '梦幻的', '阳光的', '清风般的', '微辣的',
];
const NOUNS = [
  '小厨', '美食家', '吃货', '烹饪达人', '厨房新手', '调味师', '面点师',
  '烘焙师', '料理人', '试吃员', '锅铲侠', '煎锅手', '砂锅匠', '炒勺客',
  '蒸笼妹', '烤箱哥', '味蕾控', '餐盘王', '砧板君', '炉灶达人', '汤勺博士',
];

function randomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return adj + noun;
}

const playerNameInput = ref(randomName());
let submitted = false;

// 从后端拉取的分位数和排行榜
const percentile = ref<number | null>(null);
const topTwo = ref<{ playerName: string; score: number; accuracy: number }[]>([]);

function shuffleName() {
  playerNameInput.value = randomName();
}

// 加载排行榜前两名（预览用，不需要提交成绩）
async function loadLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard?limit=2');
    if (r.ok) {
      const data = await r.json();
      topTwo.value = (data.rows ?? []).slice(0, 2);
    }
  } catch {
    /* 后端不可达时静默 */
  }
}

// 加载超越百分比（预览用，不存库）
async function loadPercentile() {
  try {
    const r = await fetch(`/api/percentile?score=${result.value.score}`);
    if (r.ok) {
      const data = await r.json();
      percentile.value = data.percentile ?? null;
    }
  } catch {
    /* 静默 */
  }
}

async function submitResult() {
  if (submitted) return;
  submitted = true;

  try {
    const resp = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: playerNameInput.value.trim() || randomName(),
        score: result.value.score,
        accuracy: result.value.accuracy,
        correctCount: result.value.correctCount,
        wrongCount: result.value.wrongCount,
        totalKinds: result.value.totalKinds,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      percentile.value = data.percentile ?? null;
    }
  } catch {
    /* 静默 */
  }

  // 提交后重新拉取排行榜（包含刚提交的成绩）
  await loadLeaderboard();
}

onMounted(() => {
  loadLeaderboard();
  loadPercentile();
  window.setTimeout(revealNext, 400); // 延迟一下，页面先渲染出来
});
const stickyNote = ref(stickyNotes[Math.floor(Math.random() * stickyNotes.length)]);
const demoMode = computed(() => String(route.query.demo ?? ''));
const isDemoResult = computed(() => ['1', 'all', 'partial'].includes(demoMode.value));
const layoutItemIds = Object.keys(kitchenLayout);
const availableLayoutItems = computed(() => {
  const byId = new Map<string, KitchenItem>();
  for (const item of [...gameStore.selectedItems, ...gameStore.distractors]) {
    if (layoutItemIds.includes(item.id)) {
      byId.set(item.id, item);
    }
  }

  return layoutItemIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
});
const demoPlacedItems = computed(() => {
  if (demoMode.value === 'all') {
    return availableLayoutItems.value;
  }

  if (demoMode.value === 'partial') {
    return availableLayoutItems.value.filter((_, index) => [0, 2, 4, 7, 9].includes(index));
  }

  return gameStore.selectedItems;
});

const result = computed<GameResult>(() => {
  if (isDemoResult.value) {
    const placedItems = demoPlacedItems.value;
    const wrongCount = demoMode.value === 'partial' ? 2 : 0;
    const totalAttempts = placedItems.length + wrongCount;

    return {
      playerName: gameStore.playerName || '测试玩家',
      score: placedItems.length,
      correctCount: placedItems.length,
      wrongCount,
      totalAttempts,
      accuracy: totalAttempts > 0 ? Math.round((placedItems.length / totalAttempts) * 100) : 0,
      totalKinds: demoMode.value === '1' ? gameStore.selectedItems.length : availableLayoutItems.value.length,
      placedItems,
      finishedAt: 1,
    };
  }

  return (
    gameStore.lastResult ?? {
      playerName: gameStore.playerName || '厨房挑战者',
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
      accuracy: 0,
      totalKinds: gameStore.selectedItems.length,
      placedItems: [],
      finishedAt: Date.now(),
    }
  );
});

// 排行榜三行：前两名 + 本局自己
const selfRow = computed(() => ({
  playerName: playerNameInput.value || '厨房挑战者',
  score: result.value.score,
  accuracy: result.value.accuracy,
}));

const lbRows = computed(() => {
  const rows = [...topTwo.value];
  // 如果本局成绩跟第 1 或第 2 重复（自己就是前两名），不重复显示
  if (!rows.some((r) => r.playerName === selfRow.value.playerName && r.score === selfRow.value.score)) {
    rows.push(selfRow.value);
  }
  // 用固定 key 标记 row 类型，方便模板判定
  return rows.map((r, i) => {
    const isSelf = r.playerName === selfRow.value.playerName && r.score === selfRow.value.score;
    return { ...r, isSelf, key: isSelf ? 'self' : `top-${i}` };
  });
});

// 评级称号
const rank = computed(() => {
  const acc = result.value.accuracy;
  if (acc >= 90) return { emoji: '🏆', title: '顶级听音厨神', cls: 'rank-s' };
  if (acc >= 75) return { emoji: '🥇', title: '资深厨房大师', cls: 'rank-a' };
  if (acc >= 50) return { emoji: '🥈', title: '新手厨师学徒', cls: 'rank-b' };
  return { emoji: '🌱', title: '听力有待提升', cls: 'rank-c' };
});

// 归位物品逐个弹出
const revealedItems = ref<string[]>([]);
let revealIndex = 0;

function revealNext() {
  if (revealIndex >= restoredItems.value.length) return;
  revealedItems.value.push(restoredItems.value[revealIndex].item.id);
  revealIndex++;
  window.setTimeout(revealNext, 180);
}

const placedCount = computed(() => result.value.placedItems.length);
const missedCount = computed(() => Math.max(result.value.totalKinds - placedCount.value, 0));
const restoredItems = computed<RestoredItemView[]>(() => {
  return result.value.placedItems.reduce<RestoredItemView[]>((items, item) => {
    const placement = kitchenLayout[item.id];
    if (!placement) {
      return items;
    }

    items.push({
      item,
      style: {
        left: `${((placement.x - placement.width / 2) / SCENE_WIDTH) * 100}%`,
        top: `${((placement.y - placement.height / 2) / SCENE_HEIGHT) * 100}%`,
        width: `${(placement.width / SCENE_WIDTH) * 100}%`,
        height: `${(placement.height / SCENE_HEIGHT) * 100}%`,
      },
    });

    return items;
  }, []);
});

const submittedText = ref('');

async function submitScore() {
  if (submitted) return;
  await submitResult();
  submittedText.value = '✓ 成绩已提交';
}

function replay() {
  void router.push({ name: 'memory' });
}

function goHome() {
  void router.push({ name: 'login' });
}
</script>

<template>
  <main class="result-page">
    <section class="result-hero" aria-label="游戏结算">
      <div class="score-board" aria-label="得分与正确率">
        <div class="score-main">
          <span>得分</span>
          <strong>{{ result.score }}</strong>
        </div>
        <div class="score-ring">
          <span>正确率</span>
          <strong>{{ result.accuracy }}%</strong>
        </div>
      </div>
    </section>

    <div class="rank-badge" :class="rank.cls">
      <span>{{ rank.emoji }}</span>
      <strong>{{ rank.title }}</strong>
    </div>

    <div class="name-pick" aria-label="输入昵称">
      <label for="result-name">你的名字</label>
      <div class="name-row">
        <input
          id="result-name"
          v-model="playerNameInput"
          type="text"
          maxlength="12"
          placeholder="取个响亮的名字吧"
          autocomplete="nickname"
        />
        <button class="shuffle-btn" type="button" aria-label="换个名字" @click="shuffleName">🎲</button>
      </div>
    </div>

    <button
      v-if="!submitted"
      class="submit-btn"
      type="button"
      @click="submitScore"
    >
      提交成绩到排行榜
    </button>
    <div v-else class="submitted-badge">{{ submittedText }}</div>

    <section class="leaderboard" aria-label="排行榜">
      <div class="percentile-badge" v-if="percentile !== null">
        你超越了 <strong>{{ percentile }}%</strong> 的玩家
      </div>

      <div class="leaderboard-heading">
        <span>排行榜</span>
        <small>{{ playerNameInput }} 的本局成绩</small>
      </div>

      <ol class="rank-list">
        <li
          v-for="(row, index) in lbRows"
          :key="row.key"
          :class="{ current: row.isSelf }"
        >
          <span class="rank-no">{{ row.isSelf ? '你' : index + 1 }}</span>
          <strong>{{ row.playerName }}</strong>
          <span class="rank-score">{{ row.score }} 分</span>
          <span class="rank-accuracy">{{ row.accuracy }}%</span>
        </li>
      </ol>
    </section>

    <section class="restored-kitchen" aria-label="归位后的厨房">
      <div class="kitchen-canvas">
        <img class="result-kitchen-bg" src="/scenes/result-kitchen.jpg" alt="厨房归位背景" />
        <span class="kitchen-shine" aria-hidden="true"></span>

        <span
          v-for="entry in restoredItems"
          v-show="revealedItems.includes(entry.item.id)"
          :key="entry.item.id"
          class="restored-item"
          :style="entry.style"
        >
          <img :src="entry.item.image" :alt="entry.item.name" draggable="false" />
        </span>
      </div>

      <span class="restore-caption">
        <span><b>{{ placedCount }}</b> 件厨具已归位</span>
        <small v-if="missedCount > 0">还有 {{ missedCount }} 件留在记忆里</small>
      </span>
      <span class="sticky-note">{{ stickyNote }}</span>

      <div class="result-actions">
        <button class="replay-btn" type="button" @click="replay">再来一局</button>
        <button class="home-btn" type="button" @click="goHome">返回首页</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.result-page {
  position: relative;
  display: grid;
  width: min(100%, 430px);
  min-height: 100dvh;
  grid-template-rows: auto auto auto;
  gap: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 14px max(16px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 20% 2%, rgba(255, 220, 120, 0.34), transparent 30%),
    linear-gradient(180deg, #fff2d4 0%, #e9f4ef 46%, #d7ecf0 100%);
  color: #4d321d;
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.34);
}

.result-hero {
  position: relative;
  z-index: 3;
}

.score-board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.score-main,
.score-ring {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(147, 98, 45, 0.1);
  border-radius: 20px;
  padding: 10px 13px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 5px 12px rgba(104, 63, 22, 0.08);
}

.score-main {
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.5), transparent 34%),
    linear-gradient(180deg, rgba(255, 249, 225, 0.96), rgba(255, 231, 183, 0.92));
  color: #9b5720;
}

.score-ring {
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.54), transparent 34%),
    linear-gradient(180deg, rgba(253, 249, 226, 0.96), rgba(224, 242, 211, 0.92));
  color: #5e7934;
}

.score-main span,
.score-ring span {
  position: relative;
  z-index: 1;
  font-family:
    "Yuanti SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 17px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.62);
}

.score-main span {
  color: #8f5a2e;
}

.score-ring span {
  color: #55733a;
}

.score-main strong,
.score-ring strong {
  position: relative;
  z-index: 1;
  font-family:
    "Yuanti SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 22px;
  font-weight: 1000;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.62);
}

.score-main strong {
  color: #e6761f;
}

.score-ring strong {
  color: #2f9a73;
}

.rank-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  border-radius: 18px;
  padding: 10px 16px;
  background: rgba(255, 252, 239, 0.9);
  box-shadow: 0 4px 16px rgba(80, 40, 20, 0.1);
  text-align: center;
}

.rank-badge span {
  font-size: 30px;
  line-height: 1;
}

.rank-badge strong {
  font-size: 18px;
  font-weight: 1000;
}

.rank-badge.rank-s {
  background: linear-gradient(135deg, rgba(255, 220, 80, 0.45), rgba(255, 200, 50, 0.3));
  border: 2px solid rgba(200, 140, 30, 0.25);
  color: #7a4a10;
}
.rank-badge.rank-a {
  background: linear-gradient(135deg, rgba(200, 200, 210, 0.35), rgba(180, 180, 195, 0.25));
  border: 2px solid rgba(140, 140, 160, 0.2);
  color: #4a4a5a;
}
.rank-badge.rank-b {
  background: linear-gradient(135deg, rgba(210, 170, 120, 0.3), rgba(190, 140, 90, 0.2));
  border: 2px solid rgba(160, 110, 60, 0.18);
  color: #6b4a30;
}
.rank-badge.rank-c {
  background: linear-gradient(135deg, rgba(180, 210, 160, 0.3), rgba(150, 190, 140, 0.2));
  border: 2px solid rgba(120, 160, 110, 0.18);
  color: #4a6b30;
}

.name-pick {
  display: grid;
  gap: 6px;
}

.name-pick label {
  color: #5b341c;
  font-size: 13px;
  font-weight: 800;
}

.name-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.name-row input {
  flex: 1;
  min-width: 0;
  height: 48px;
  border: 1px solid rgba(147, 98, 45, 0.2);
  border-radius: 14px;
  padding: 0 14px;
  background: rgba(255, 252, 239, 0.9);
  color: #4d321d;
  font-size: 16px;
  font-weight: 800;
  outline: none;
  box-shadow: inset 0 1px 3px rgba(104, 63, 22, 0.06);
}

.name-row input:focus {
  border-color: #e27820;
  box-shadow: 0 0 0 3px rgba(226, 120, 32, 0.12);
}

.shuffle-btn {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid rgba(147, 98, 45, 0.2);
  border-radius: 14px;
  background: rgba(255, 252, 239, 0.9);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  box-shadow: inset 0 1px 3px rgba(104, 63, 22, 0.06);
}

.submit-btn {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffb740, #e27820);
  color: #fff;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 4px 0 #b05c15, 0 6px 14px rgba(120, 60, 20, 0.18);
  transition: transform 120ms ease;
}

.submit-btn:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #b05c15, 0 4px 10px rgba(120, 60, 20, 0.12);
}

.submitted-badge {
  width: 100%;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(45, 128, 96, 0.12);
  color: #2d8060;
  font-size: 15px;
  font-weight: 900;
}

.shuffle-btn:active {
  background: #fff2d8;
}

.restored-kitchen {
  position: relative;
  z-index: 1;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 390 / 844;
  border: 1px solid rgba(116, 77, 45, 0.12);
  border-radius: 28px;
  background: #f6d59e;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 24px rgba(61, 81, 82, 0.16);
}

.kitchen-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.result-kitchen-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kitchen-shine {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 34%),
    radial-gradient(circle at 50% 18%, rgba(255, 236, 154, 0.18), transparent 36%);
  pointer-events: none;
}

.restore-caption {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: 7px;
  width: min(78%, 286px);
  color: #7d4b24;
  font-size: 13px;
  font-weight: 900;
  transform: translateX(-50%);
}

.restore-caption > span {
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 999px;
  padding: 8px 16px 9px;
  background: rgba(255, 250, 227, 0.9);
  box-shadow: 0 8px 18px rgba(84, 62, 35, 0.13);
  backdrop-filter: blur(6px);
}

.restore-caption b {
  color: #e27820;
}

.restore-caption small {
  color: rgba(125, 75, 36, 0.68);
  font-size: 11px;
  font-weight: 800;
}

.sticky-note {
  position: absolute;
  top: 80px;
  left: 50%;
  z-index: 4;
  display: grid;
  width: 168px;
  min-height: 116px;
  place-items: center;
  border: 1px solid rgba(206, 146, 56, 0.14);
  border-radius: 9px 14px 11px 13px;
  padding: 19px 16px 16px;
  background:
    linear-gradient(135deg, rgba(255, 251, 199, 0.48), rgba(255, 226, 118, 0.38));
  color: #70411d;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.38;
  text-align: center;
  box-shadow:
    0 12px 18px rgba(101, 71, 32, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(3px);
  transform: translateX(-50%) rotate(-2deg);
  transform-origin: 50% 0;
  animation: sticky-float 3.2s ease-in-out infinite;
}

.sticky-note::before {
  position: absolute;
  top: -11px;
  left: 50%;
  width: 54px;
  height: 18px;
  border-radius: 5px;
  background: rgba(255, 244, 219, 0.35);
  box-shadow:
    0 2px 5px rgba(111, 78, 38, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
  content: "";
  transform: translateX(-50%) rotate(-5deg);
}

.sticky-note::after {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 34px;
  height: 34px;
  border-radius: 13px 0 9px 0;
  background:
    linear-gradient(135deg, rgba(236, 181, 61, 0.01) 0 48%, rgba(213, 151, 37, 0.12) 49% 100%),
    linear-gradient(315deg, rgba(255, 244, 168, 0.4), rgba(255, 229, 122, 0.32));
  box-shadow:
    -4px -4px 8px rgba(123, 85, 34, 0.04),
    inset 1px 1px 0 rgba(255, 255, 255, 0.25);
  content: "";
}

.restored-item {
  position: absolute;
  z-index: 2;
  display: block;
  transform: none;
  animation: item-place 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.restored-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter:
    drop-shadow(0 5px 6px rgba(45, 67, 72, 0.2))
    drop-shadow(0 0 6px rgba(255, 244, 196, 0.28));
}

.leaderboard {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 10px;
  border: 1px solid rgba(113, 77, 48, 0.13);
  border-radius: 24px;
  padding: 13px;
  background: rgba(255, 252, 239, 0.86);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 8px 20px rgba(83, 61, 35, 0.12);
  backdrop-filter: blur(10px);
}

.percentile-badge {
  margin-bottom: 4px;
  border-radius: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(255, 225, 120, 0.55), rgba(255, 180, 60, 0.35));
  color: #6b3a18;
  font-size: 15px;
  font-weight: 900;
  text-align: center;
  box-shadow: 0 2px 8px rgba(120, 70, 30, 0.08);
  backdrop-filter: blur(4px);
}

.percentile-badge strong {
  color: #c85510;
  font-size: 22px;
}

.leaderboard-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.leaderboard-heading span {
  color: #5b341c;
  font-size: 18px;
  font-weight: 1000;
}

.leaderboard-heading small {
  color: #9a7656;
  font-size: 11px;
  font-weight: 800;
}

.rank-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank-list li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  border-radius: 15px;
  padding: 8px 9px;
  background: rgba(255, 244, 216, 0.58);
  color: #684124;
}

.rank-list li.current {
  background: linear-gradient(90deg, rgba(255, 213, 111, 0.88), rgba(255, 245, 207, 0.86));
}

.rank-no {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 50%;
  background: #fffaf0;
  color: #d07821;
  font-size: 13px;
  font-weight: 1000;
}

.rank-list strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-score,
.rank-accuracy {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.rank-accuracy {
  color: #2d8060;
}

.result-actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  z-index: 5;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.result-actions button {
  min-height: 48px;
  border: 0;
  border-radius: 17px;
  font-size: 16px;
  font-weight: 900;
  box-shadow: 0 5px 0 rgba(104, 62, 20, 0.22);
}

.replay-btn {
  background: linear-gradient(180deg, #ffdc76, #f09828);
  color: #5b2e0f;
}

.home-btn {
  background: rgba(255, 255, 255, 0.76);
  color: #755033;
}

@keyframes item-place {
  from {
    opacity: 0;
    transform: translateY(-8%) scale(0.92);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes sticky-float {
  0%,
  100% {
    translate: 0 0;
    rotate: 0deg;
  }
  50% {
    translate: 0 -5px;
    rotate: 1deg;
  }
}

@media (max-width: 380px) {
  .score-main,
  .score-ring {
    min-height: 56px;
    gap: 8px;
    padding: 9px 10px;
  }

  .score-main span,
  .score-ring span {
    font-size: 15px;
  }

  .score-main strong,
  .score-ring strong {
    font-size: 20px;
  }

  .sticky-note {
    top: 76px;
    width: 150px;
    min-height: 102px;
    font-size: 12px;
  }
}
</style>
