export type Difficulty = 'beginner' | 'normal' | 'hard';

/** 音效时长类型：绵长型做铺底，短促型提供动作辨识度 */
export type SoundType = 'long' | 'short';

export interface KitchenItem {
  id: string;
  name: string;
  emoji: string;
  /** 透明 PNG 图标路径 */
  image: string;
  /** 专属音效路径；干扰项无音效则为 null */
  soundPath: string | null;
  /** 音效类型，仅有音效的目标物品需要 */
  soundType?: SoundType;
  /** 播放增益 0~1，参考音效 readme */
  volume?: number;
  /** 音效循环片段时长(秒)，默认 1.5 */
  loopSec?: number;
  x: number;
  y: number;
}

/** 一局结算结果 */
export interface GameResult {
  playerName: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalAttempts: number;
  accuracy: number;
  totalKinds: number;
  placedItems: KitchenItem[];
  finishedAt: number;
}
