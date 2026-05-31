# AGENTS.md

本文件为 AI 编码助手提供项目上下文与协作约定。

## 项目概述

EchoTrace（中文名：声迹）是一个前后端分离的手机端 WebApp 小游戏项目。

核心玩法：玩家在 8 秒记忆阶段观察厨房场景，并记住每个厨具的专属声音；随后进入听音挑战阶段，在视觉屏蔽和多音效交织的环境下点击掉落厨具，最终按厨房还原准确度结算。

当前 MVP 优先级：

1. 登录页
2. 记忆页
3. 听音挑战页
4. 结算页

当前已实现前端三个核心页面：登录页、记忆页、听音挑战页（核心玩法跑通）。所有前端页面默认按移动端竖屏优先设计，桌面预览时应以手机宽度居中展示。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + TypeScript + Pinia + Vue Router |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | MySQL |

## 目录结构

```
EchoTrace/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── public/
│   │   ├── scenes/        # 记忆页厨房场景图
│   │   └── sounds/        # 厨具音效
│   └── src/
│       ├── App.vue
│       ├── main.ts
│       ├── api/           # 接口请求封装
│       ├── assets/        # 静态资源
│       ├── components/    # 公共组件
│       ├── composables/   # 组合式函数
│       ├── router/        # 路由
│       ├── stores/        # Pinia
│       ├── types/         # 类型定义
│       ├── utils/         # 工具函数
│       └── views/         # 页面
├── backend/
│   ├── src/
│   │   ├── config/        # 配置（数据库、环境变量）
│   │   ├── controllers/   # 控制器
│   │   ├── middlewares/   # 中间件
│   │   ├── models/        # 数据模型
│   │   ├── routes/        # 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── types/         # 类型定义
│   │   └── utils/         # 工具函数
│   └── tests/
└── docs/
```

## 编码约定

- 全栈使用 TypeScript，避免 `any`
- 前端组件使用 `<script setup lang="ts">` 语法
- 前端 UI 按手机端 WebApp 优先设计，优先验证 390×844 / 430×932 等竖屏视口
- 前端页面放在 `frontend/src/views/`
- 前端全局状态放在 `frontend/src/stores/`
- 前端共享类型放在 `frontend/src/types/`
- 后端遵循 Controller → Service → Model 分层
- API 路径统一前缀 `/api`
- 提交信息使用约定式提交（feat / fix / docs / refactor / test / chore）

## 当前前端页面

| 路由 | 页面 | 文件 | 状态 |
|---|---|---|---|
| `/` | 登录页 | `frontend/src/views/LoginView.vue` | ✅ 完成 |
| `/memory` | 记忆页 | `frontend/src/views/MemoryView.vue` | ✅ 完成 |
| `/game` | 听音挑战页 | `frontend/src/views/GameView.vue` | ✅ 核心玩法完成 |
| `/result` | 结算页 | `frontend/src/views/ResultView.vue` | ✅ 完成 |

### 登录页

- 三种难度选择卡片（新手 6 件 / 普通 12 件 / 困难 18 件，难度卡片用真实厨具图标），默认新手
- 顶部工具栏已移除（不再有音效开关/设置按钮），界面更简洁
- 点击"开始挑战"→ 调用 `pickTargets()` 随机抽 6 个本局目标（3 绵长 + 3 短促）→ 进入记忆页

### 记忆页

- 固定 8 秒倒计时
- 背景图使用 `yulan.png`（已压缩 859K→234K）
- 标题："请快速记住图中物品的声音！"
- 展示本局随机到的 6 个厨具
- 厨具按固定顺序依次高亮弹动，播放各自专属音效
- 进页面先预加载本局音效（`canplay` + 超时兜底），缓冲完成再开始轮播
- 倒计时结束后黑屏 → 约 1.6 秒后自动跳转听音挑战页

### 听音挑战页（核心玩法）

整体结构：进页面先解码图片，点击"开始游戏"按钮（提供浏览器 autoplay 所需的用户手势）后启动，60 秒倒计时。
按钮下方提示："听声音，点出正在响的厨具" + "（注意：有可能有多个声音在响哦！）"

声音叠加逻辑（`useGameSoundscape`，按"组数"递进）：

- 阶段一：1 个单音效，2 组，每组 4~5s
- 阶段二：2 个音效叠加，4 组，每组约 10s
- 阶段三：3 个音效叠加，剩余组，每组约 10s
- 所有厨具音效使用 Web Audio API `AudioBufferSourceNode` 截取前 N 秒循环（默认 1.5s，微波炉 2.5s，由 `KitchenItem.loopSec` 字段控制）
- 背景音乐（`背景音乐.m4a`）低音量全程铺底，不随阶段切换
- 每次切换新声音时，立即掉出一个对应物品，不让用户干等

掉落规则：

- 掉落池 = 本局 6 个目标 + 干扰项
- 六条垂直固定轨道防碰撞，批次生成、随阶段加快（每轮 2→3→4 个，间隔 1100→900→700ms）
- 阶段一同屏上限 5 个，不足 4 个自动补齐；阶段二上限 6；阶段三上限 7
- 同屏同一物品不超过 2 个
- 最后 18 秒强偏"未提供机会"的目标，保证公平性
- 图片进页时预加载解码（`img.decode()`），避免掉落卡顿

点击判定：

- 当前正在发声的物品 = 正确答案，点击发光 + 飞入收纳筐（去重）
- 其他所有掉落物 = 错误，触发爆炸粒子 + 屏幕震动 + 手机马达（`navigator.vibrate`，iOS 不支持）
- 点错已收集物品会从筐里移除

实时计分（HUD 显示得分 + 正确数 + 错误数）：

```
得分 = 正确次数 × 10 + 已收集种类 × 准确率(%) × 0.1 - 错误次数 × 8
```

游戏结束自动跳转结算页（`/result`），不再使用旧游戏结束遮罩。

### 结算页（`ResultView`）

- 得分 + 正确率展示
- 评级称号（按准确率）：
  - 90%+ → 🏆 顶级听音厨神
  - 75-89% → 🥇 资深厨房大师
  - 50-74% → 🥈 新手厨师学徒
  - <50% → 🌱 听力有待提升
- 名字输入框（随机生成 20 形容词 × 21 名词组合，🎲 按钮可换名）
- "提交成绩到排行榜"按钮（手动提交，防止误操作）
- 排行榜三行：数据库 top 2 + 本局自己（黄色高亮）
- 超越百分比："你超越了 X% 的玩家"（预览时即显示，不依赖提交）
- 厨房归位图：已收集物品按 `kitchenLayout` 坐标逐个弹跳出现（每件间隔约 180ms）
- 便签条随机文案 + "再来一局" / "返回首页"按钮

## 后端

- Express + TypeScript，监听 `127.0.0.1:3001`
- SQLite（`echotrace.db`）存储成绩，零安装
- API：
  - `POST /api/results` — 提交成绩（返回 `percentile`）
  - `GET /api/leaderboard` — 查询排行榜
  - `GET /api/percentile?score=N` — 计算某分数超越百分比
- pm2 进程管理，nginx 反代 `/api/`
- 排行榜管理页：`/admin.html`（3 秒自动刷新）

## 素材资源

### 场景图

```text
frontend/public/scenes/home-background.png   # 登录页
frontend/public/scenes/yulan.png             # 记忆页（已替代 kitchen-memory.png）
frontend/public/scenes/game_background.png   # 听音挑战页
frontend/public/scenes/result-kitchen.jpg    # 结算页
```

### 厨具图标（已压缩 /items/kitchen/）

21 个 PNG，已压缩。原图备份在 `.image-originals/`（已 gitignore）。

11 个有对应音效的目标物品，10 个无音效的干扰物品。物品清单见 `frontend/src/stores/game.ts` 中 `targetItems` 与 `distractorItems`。

### 音效

厨具音效（11 个 .m4a，由原始 WAV 转 AAC 压缩而来）：

```text
frontend/public/sounds/kitchen-items/
├── 煎炸声-音量平衡版.m4a       # 绵长型 — wok
├── 水龙头-音量平衡版.m4a       # 绵长型 — faucet
├── 锅里咕嘟沸腾-音量平衡版.m4a  # 绵长型 — boiling_pot
├── 微波炉-加响版.m4a           # 绵长型 — microwave
├── 菜刀砧板-音量平衡版.m4a     # 短促型 — cutting_board
├── 碗筷餐盘-音量平衡版.m4a     # 短促型 — dishes
├── 冰块入杯-音量平衡版.m4a     # 短促型 — ice_cubes_cup
├── 掰开鸡蛋-音量平衡版.m4a     # 短促型 — cracking_eggs
├── 爆米花-音量平衡版.m4a       # 短促型 — popcorn_machine
├── 厨房计时器-降低音量版.m4a   # 短促型 — kitchen_timer
└── 刨刀-音量平衡版.m4a         # 短促型 — fruit_peeler
```

背景音乐：

```text
frontend/public/sounds/背景音乐.m4a   # 挑战页环境铺底（统一使用此曲，不随阶段切换）
```

如需新增音效，建议统一转为 .m4a（AAC 128k），体积约为 WAV 的 1/8，避免加载缓慢。

## 组合函数

| 文件 | 用途 |
|---|---|
| `useBackgroundMusic.ts` | 登录页合成环境背景音（Web Audio 双振荡器），随 `gameStore.soundEnabled` 启停 |
| `useGameSoundscape.ts` | 挑战页音景：背景乐铺底 + 厨具音效 Web Audio 截取循环（`loopSec`） + 公平选择算法；由游戏页"开始"按钮的用户手势触发 `resume()` 启动 |

注：登录页顶部音效开关已移除，`soundEnabled` 默认关闭；进入挑战页点击"开始游戏"时 `resume()` 会强制开启音效，故游戏全程有声，不依赖登录页开关。

## 数据模型

类型定义在 `frontend/src/types/game.ts`。物品数据在 `frontend/src/stores/game.ts`：

- `targetItems`：11 个有音效的目标物品（含 soundPath/soundType/volume/loopSec）
- `distractorItems`：10 个无音效干扰物品
- `GameResult`：结算结果（score/accuracy/correctCount/wrongCount/totalKinds/placedItems）
- `pickTargets()`：每局随机抽 3 绵长 + 3 短促
- `saveResult()`：存储成绩到本地 + 同步 SQLite 排行榜

## 常用命令

- 前端安装依赖：`cd frontend && npm install`
- 前端启动：`cd frontend && npm run dev`
- 前端构建：`cd frontend && npm run build`
- 后端启动：`cd backend && npm run dev`
- 测试：待补充

## 注意事项

- 敏感配置放入 `.env`，不要提交到仓库
- 数据库相关操作通过 service 层调用，不在 controller 中直接写 SQL
- `frontend/public/` 下的资源会以站点根路径访问，例如 `/scenes/kitchen-memory.png`
- 当前本机 `npm install` 曾出现长时间无输出，若需要验证前端，优先确认网络/npm registry 状态
- 构建脚本使用 `vue-tsc --noEmit && vite build`，避免在项目根目录生成 `vite.config.js` / `vite.config.d.ts`
