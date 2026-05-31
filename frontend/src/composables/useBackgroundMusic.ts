import { useGameStore } from '../stores/game';
import { watch } from 'vue';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
// 跟踪所有活跃的振荡器节点,停止时必须同步 stop
const oscNodes: OscillatorNode[] = [];
let isPlaying = false;

function ensureContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function createAmbientPatch(ctx: AudioContext): {
  filter: BiquadFilterNode;
} {
  const now = ctx.currentTime;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 380;
  filter.Q.value = 0.7;

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 110;
  oscNodes.push(osc1);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 164.81;
  oscNodes.push(osc2);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.12;
  oscNodes.push(lfo);

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.15;

  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start(now);

  osc1.connect(filter);
  osc2.connect(filter);
  osc1.start(now);
  osc2.start(now);

  return { filter };
}

export function useBackgroundMusic() {
  const store = useGameStore();

  watch(
    () => store.soundEnabled,
    (enabled) => {
      if (enabled && !isPlaying) {
        startMusic();
      } else if (!enabled && isPlaying) {
        stopMusic();
      }
    },
    { immediate: true },
  );

  function dispose() {
    stopMusic();
  }

  return { dispose };
}

function startMusic() {
  try {
    const ctx = ensureContext();

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.04;
    masterGain.connect(ctx.destination);

    const patch = createAmbientPatch(ctx);
    patch.filter.connect(masterGain);
    isPlaying = true;
  } catch {
    isPlaying = false;
  }
}

function stopMusic() {
  // 1. 同步停止所有振荡器（关键:不能依赖 async close）
  for (const osc of oscNodes) {
    try {
      osc.stop();
    } catch {
      // 可能已停止,忽略
    }
    try {
      osc.disconnect();
    } catch {
      // 忽略
    }
  }
  oscNodes.length = 0;

  // 2. 断开主增益（立即静音）
  if (masterGain) {
    try {
      masterGain.disconnect();
    } catch {
      // 忽略
    }
    masterGain = null;
  }

  // 3. 关闭整个 AudioContext
  if (audioCtx) {
    const ctx = audioCtx;
    audioCtx = null;
    try {
      void ctx.close();
    } catch {
      // 忽略
    }
  }

  isPlaying = false;
}
