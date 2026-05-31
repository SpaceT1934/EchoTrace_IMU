import { defineStore } from 'pinia';
import type { Difficulty, GameResult, KitchenItem } from '../types/game';

interface GameState {
  playerName: string;
  difficulty: Difficulty;
  memoryDurationSeconds: number;
  sceneImagePath: string;
  selectedItems: KitchenItem[];
  soundEnabled: boolean;
  lastResult: GameResult | null;
  leaderboard: GameResult[];
}

const IMG = '/items/kitchen/';
const SND = '/sounds/kitchen-items/';
const LEADERBOARD_KEY = 'echotrace-leaderboard';

function loadLeaderboard(): GameResult[] {
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as GameResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(results: GameResult[]) {
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(results.slice(0, 10)));
  } catch {
    /* localStorage 不可用时静默 */
  }
}

/**
 * 有专属音效的目标厨具（11 个）。
 * 这些是"听音辨物"的正确目标，听到对应音效时点击它即为正确。
 */
const targetItems: KitchenItem[] = [
  // 绵长型（铺底质感，稍低音量）
  { id: 'wok', name: '炒锅', emoji: '🍳', image: `${IMG}wok.png`, soundPath: `${SND}煎炸声-音量平衡版.m4a`, soundType: 'long', volume: 0.72, x: 22, y: 50 },
  { id: 'faucet', name: '水龙头', emoji: '🚰', image: `${IMG}faucet.png`, soundPath: `${SND}水龙头-音量平衡版.m4a`, soundType: 'long', volume: 0.72, x: 50, y: 46 },
  { id: 'boiling_pot', name: '汤锅', emoji: '🍲', image: `${IMG}boiling_pot.png`, soundPath: `${SND}锅里咕嘟沸腾-音量平衡版.m4a`, soundType: 'long', volume: 0.72, x: 76, y: 50 },
  { id: 'microwave', name: '微波炉', emoji: '📻', image: `${IMG}microwave.png`, soundPath: `${SND}微波炉-加响版.m4a`, soundType: 'long', volume: 0.60, loopSec: 2.5, x: 36, y: 64 },
  // 短促型（动作辨识度高，音量稍大）
  { id: 'cutting_board', name: '菜刀砧板', emoji: '🔪', image: `${IMG}cutting_board.png`, soundPath: `${SND}菜刀砧板-音量平衡版.m4a`, soundType: 'short', volume: 0.82, x: 64, y: 64 },
  { id: 'dishes', name: '碗筷餐盘', emoji: '🍽️', image: `${IMG}dishes.png`, soundPath: `${SND}碗筷餐盘-音量平衡版.m4a`, soundType: 'short', volume: 0.65, x: 26, y: 78 },
  { id: 'ice_cubes_cup', name: '冰块入杯', emoji: '🧊', image: `${IMG}ice_cubes_cup.png`, soundPath: `${SND}冰块入杯-音量平衡版.m4a`, soundType: 'short', volume: 0.82, x: 50, y: 80 },
  { id: 'cracking_eggs', name: '掰鸡蛋', emoji: '🥚', image: `${IMG}cracking_eggs.png`, soundPath: `${SND}掰开鸡蛋-音量平衡版.m4a`, soundType: 'short', volume: 0.82, x: 74, y: 78 },
  { id: 'popcorn_machine', name: '爆米花', emoji: '🍿', image: `${IMG}popcorn_machine.png`, soundPath: `${SND}爆米花-音量平衡版.m4a`, soundType: 'short', volume: 0.65, x: 14, y: 66 },
  { id: 'kitchen_timer', name: '厨房计时器', emoji: '⏲️', image: `${IMG}kitchen_timer.png`, soundPath: `${SND}厨房计时器-降低音量版.m4a`, soundType: 'short', volume: 0.55, x: 88, y: 66 },
  { id: 'fruit_peeler', name: '刨刀', emoji: '🥕', image: `${IMG}fruit_peeler.png`, soundPath: `${SND}刨刀-音量平衡版.m4a`, soundType: 'short', volume: 0.82, x: 50, y: 32 },
];

/**
 * 无音效的干扰厨具（10 个）。
 * 仅作为掉落干扰项，点击它们一律判错。
 */
const distractorItems: KitchenItem[] = [
  { id: 'blender', name: '榨汁机', emoji: '🥤', image: `${IMG}blender.png`, soundPath: null, x: 0, y: 0 },
  { id: 'cabinet', name: '橱柜', emoji: '🗄️', image: `${IMG}cabinet.png`, soundPath: null, x: 0, y: 0 },
  { id: 'coffee_machine', name: '咖啡机', emoji: '☕', image: `${IMG}coffee_machine.png`, soundPath: null, x: 0, y: 0 },
  { id: 'egg_beater', name: '打蛋器', emoji: '🥚', image: `${IMG}egg_beater.png`, soundPath: null, x: 0, y: 0 },
  { id: 'fridge', name: '冰箱', emoji: '🧊', image: `${IMG}fridge.png`, soundPath: null, x: 0, y: 0 },
  { id: 'gas_stove', name: '燃气灶', emoji: '🔥', image: `${IMG}gas_stove.png`, soundPath: null, x: 0, y: 0 },
  { id: 'hand_mixer_bowl', name: '手持搅拌', emoji: '🥣', image: `${IMG}hand_mixer_bowl.png`, soundPath: null, x: 0, y: 0 },
  { id: 'kettle', name: '水壶', emoji: '🫖', image: `${IMG}kettle.png`, soundPath: null, x: 0, y: 0 },
  { id: 'pressure_cooker', name: '高压锅', emoji: '🍚', image: `${IMG}pressure_cooker.png`, soundPath: null, x: 0, y: 0 },
  { id: 'range_hood', name: '抽油烟机', emoji: '🌬️', image: `${IMG}range_hood.png`, soundPath: null, x: 0, y: 0 },
];

// 新手模式：从目标里取 6 个（3 绵长 + 3 短促，便于混音）
const beginnerTargets: KitchenItem[] = [
  targetItems[0], // 炒锅
  targetItems[1], // 水龙头
  targetItems[2], // 汤锅
  targetItems[4], // 菜刀砧板
  targetItems[5], // 碗筷餐盘
  targetItems[6], // 冰块入杯
];

export const useGameStore = defineStore('game', {
  state: (): GameState => ({
    playerName: '',
    difficulty: 'beginner',
    memoryDurationSeconds: 8,
    sceneImagePath: '/scenes/yulan.png',
    selectedItems: beginnerTargets,
    soundEnabled: false,
    lastResult: null,
    leaderboard: loadLeaderboard(),
  }),
  getters: {
    // 本局目标物品的 id 集合
    targetIds: (state): Set<string> => new Set(state.selectedItems.map((i) => i.id)),
    // 干扰物品（不在本局目标里的所有物品，含其它目标和纯干扰项）
    distractors(state): KitchenItem[] {
      const ids = new Set(state.selectedItems.map((i) => i.id));
      return [...targetItems, ...distractorItems].filter((i) => !ids.has(i.id));
    },
  },
  actions: {
    setPlayerName(name: string) {
      this.playerName = name.trim();
    },
    setDifficulty(difficulty: Difficulty) {
      this.difficulty = difficulty;
    },
    toggleSound() {
      this.soundEnabled = !this.soundEnabled;
    },
    /** 每局从完整池里随机抽 6 个目标（3 绵长 + 3 短促） */
    pickTargets() {
      const shuffle = <T>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const longs = shuffle(targetItems.filter((i) => i.soundType === 'long'));
      const shorts = shuffle(targetItems.filter((i) => i.soundType === 'short'));
      this.selectedItems = [...longs.slice(0, 3), ...shorts.slice(0, 3)];
    },
    saveResult(result: Omit<GameResult, 'playerName' | 'finishedAt'>) {
      const nextResult: GameResult = {
        ...result,
        playerName: this.playerName || '厨房挑战者',
        finishedAt: Date.now(),
      };
      this.lastResult = nextResult;
      this.leaderboard = [nextResult, ...this.leaderboard]
        .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.finishedAt - b.finishedAt)
        .slice(0, 5);
      saveLeaderboard(this.leaderboard);
    },
  },
});
