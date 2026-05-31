# EchoTrace（声迹）

手机端竖屏 WebApp 听觉记忆小游戏。

**核心玩法：** 在记忆阶段记住每种厨具的专属声音，然后在挑战阶段通过听音辨物点击正在发声的厨具——声音逐渐叠加，难度渐进提升。

## 游戏流程

```
首页（选难度）→ 记忆页（8s 记声音）→ 听音挑战页（60s）→ 结算页
```

每次进入游戏随机抽取 6 个厨具作为本局目标（3 绵长型 + 3 短促型）。听音挑战页声音分三个阶段递进：1 个单音 → 2 个叠加 → 3 个叠加。点击当前正在发声的厨具算正确，点错会触发爆炸特效 + 屏幕震动。

## 技术栈

### 前端
- **框架**: Vue 3 + Vite + TypeScript
- **状态管理**: Pinia
- **路由**: Vue Router（SPA history 模式）
- **音效**: AAC(.m4a) 厨具音效 + MP3 背景音乐，Web Audio API 截取循环播放

### 后端
- **运行时**: Node.js + Express + TypeScript
- **数据库**: SQLite（better-sqlite3，零安装）
- **进程管理**: pm2

## 项目结构

```
EchoTrace/
├── frontend/                # Vue 3 前端
│   ├── public/
│   │   ├── items/kitchen/   # 21 张厨具图标（已压缩）
│   │   ├── scenes/          # 4 张场景背景图（已压缩）
│   │   └── sounds/          # 厨具音效(.m4a) + 背景音乐
│   └── src/
│       ├── views/           # 4 个页面（Login / Memory / Game / Result）
│       ├── stores/          # gameStore（物品池 + 难度 + 音效状态 + 排行榜）
│       ├── composables/     # useBackgroundMusic / useGameSoundscape
│       ├── types/           # KitchenItem / GameResult 等
│       ├── router/          # Vue Router 路由 + beforeEach 音频清理
│       └── assets/          # 全局样式
├── backend/                 # Express 后端
│   └── src/
│       ├── index.ts         # 入口（3 个 API）
│       └── db.ts            # SQLite 读写
└── docs/                    # PRD 等文档
```

## 开发

```bash
# 前端
cd frontend
npm install
npm run dev        # 本地开发 → http://localhost:3000
npm run build      # 生产构建

# 后端
cd backend
npm install
npm run dev        # 启动 Express API → http://localhost:3001
```

## 已实现功能

- 登录页：三种难度选择，随机抽本局目标
- 记忆页：8 秒倒计时、厨具依次弹动 + 播音效、音效预加载
- 听音挑战页：点击开始、三阶段音效叠加、Web Audio 循环截取、轨道防撞、防重复、对错判定、点错爆炸/震动、实时分数显示
- 结算页：评级称号、排行榜 top 2 + 自己、超越百分比、名字输入、手动提交成绩、厨房归位逐帧动画
- 物品池：11 个有音效目标 + 10 个干扰项，随机 6 个/局
- 公平算法：保证所有目标都有机会被正确点击
- 后端 API：SQLite 成绩存储、排行榜查询、百分比计算
- 排行榜管理页：`/admin.html` 实时自动刷新
- 资源优化：图标/场景图压缩、音效转 AAC、图片预加载解码

## 待开发

- 6 / 12 / 18 难度与物品池打通
- 反馈音效（正确 / 错误 / 通关）
- 用户账号系统
