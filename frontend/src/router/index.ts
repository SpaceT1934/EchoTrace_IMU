import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import MemoryView from '../views/MemoryView.vue';
import GameView from '../views/GameView.vue';
import ResultView from '../views/ResultView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/memory',
      name: 'memory',
      component: MemoryView,
    },
    {
      path: '/game',
      name: 'game',
      component: GameView,
    },
    {
      path: '/result',
      name: 'result',
      component: ResultView,
    },
  ],
});

// 每次页面切换前无条件消灭所有残留 Audio,杜绝跨页面杂音
router.beforeEach(() => {
  const all = document.querySelectorAll('audio');
  for (const a of all) {
    try { a.pause(); } catch { /* ignore */ }
    try { a.currentTime = 0; } catch { /* ignore */ }
    try { a.remove(); } catch { /* ignore */ }
  }
});

export default router;
