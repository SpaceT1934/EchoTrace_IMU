# AGENTS.md

本文件为 AI 编码助手提供项目上下文与协作约定。

## 项目概述

EchoTrace（中文名：声迹）是一个前后端分离的手机端 WebApp 小游戏项目。

核心玩法：玩家在 8 秒记忆阶段观察厨房场景，并记住每个厨具的专属声音；随后进入听音挑战阶段，通过陀螺仪倾斜手机控制底部收纳筐左右移动，接住正在发声的目标厨具、避开干扰项，最终按准确度结算。

所有前端页面默认按移动端竖屏优先设计，桌面预览时应以手机宽度居中展示。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + TypeScript + Pinia + Vue Router |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite（better-sqlite3） |
| 部署 | pm2 + nginx + HTTPS 自签名 / Cloudflare Tunnel |

## 目录结构

```
EchoTrace/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── public/
│   │   ├── items/kitchen/ # 21 张厨具图标
│   │   ├── scenes/        # 4 张场景图
│   │   └── sounds/        # 11 个厨具音效 + 1 首背景音乐
│   └── src/
│       ├── App.vue
│       ├── main.ts
│       ├── api/           # 接口请求封装
│       ├── assets/        # 静态样式
│       ├── components/    # 公共组件
│       ├── composables/   # useGyroBasket / useGameSoundscape / useBackgroundMusic
│       ├── router/        # 路由 + beforeEach 音频清理
│       ├── stores/        # Pinia（物品池 + 难度 + 排行榜）
│       ├── types/         # 类型定义
│       ├── utils/         # 工具函数
│       └── views/         # Login / Memory / Game / Result
├── backend/
│   └── src/
│       ├── index.ts       # Express 入口，3 个 API，监听 127.0.0.1:3002
│       └── db.ts          # SQLite 读写（echotrace.db）
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
| `/game` | 听音挑战页 | `frontend/src/views/GameView.vue` | ✅ 完成 |
| `/result` | 结算页 | `frontend/src/views/ResultView.vue` | ✅ 完成 |

### 登录页

- 三种难度选择卡片（新手 6 件 / 普通 12 件 / 困难 18 件），默认新手
- 顶部工具栏已移除，界面简洁
- 点击"开始挑战"→ 调用 `pickTargets()` 随机抽 6 个本局目标（3 绵长 + 3 短促）→ 进入记忆页

### 记忆页

- 固定 8 秒倒计时
- 背景图使用 `yulan.png`
- 标题："请快速记住图中物品的声音！"
- 展示本局随机到的 6 个厨具，按固定顺序依次高亮弹动 + 播放专属音效
- 进页面先预加载本局音效（`canplay` + 超时兜底），缓冲完成再开始轮播
- 倒计时结束后黑屏 → 约 1.6 秒后自动跳转听音挑战页

### 听音挑战页（核心玩法）

**交互方式**：陀螺仪倾斜手机控制底部收纳筐左右移动，接住目标物品。手动触摸点击作为备选输入方式。

进页面先解码图片，点击"开始游戏"按钮后启动，60 秒倒计时。

**声音叠加逻辑**（`useGameSoundscape`，按真实时间递进）：

| 阶段 | 时间 | 声音数量 | 说明 |
|---|---|---|---|
| 阶段一 | 0-18s | 1 个单音效 | 开局舒缓 |
| 阶段二 | 18-38s | 2 个音效叠加 | 难度上升 |
| 阶段三 | 38-60s | 3 个音效叠加 | 最紧张 |

- 物品掉落速度平滑加速（间隔 900ms→260ms，速度 2.8s→1.1s）
- 所有厨具音效使用 Web Audio API `AudioBufferSourceNode` 截取前 N 秒循环（默认 1.5s，微波炉 2.5s，由 `KitchenItem.loopSec` 控制）
- 背景音乐（`背景音乐.m4a`）低音量全程铺底
- 声音切换无缝：先更新 `activeItems`，新 buffer 后台加载，旧声音继续播放，就绪后秒切，全程无静音间隙

**掉落与标记规则**：

- 声音响起时，每个发声物品立刻掉落一个，并标记 `isTarget = true`（终身不变）
- 干扰项由 `scheduleNext()` 定时生成，`isTarget = false`
- 两大道严格单轨单物品，同一时间水平最多 2 个物品
- 掉落池 = 本局 6 个目标 + 10 个干扰项
- 图片异步后台解码，不阻塞"开始游戏"按钮显示

**点击/碰撞判定**：

| 触发方式 | 判定标准 | 说明 |
|---|---|---|
| 筐碰撞 | `isTarget` | 物品出生即标定，终身不变 |
| 手动点击 | `activeIds` | 只有当前正在发声的算正确 |

- 正确：物品发光 + 飞入收纳筐（去重）
- 错误：爆炸粒子 + 屏幕震动 + 手机马达（`navigator.vibrate`）
- 点错已收集物品会从筐里移除
- 碰撞检测降频至 30fps，DOM 映射缓存避免每帧 querySelector

**实时计分**：

```
得分 = 正确次数 × 10 + 已收集种类 × 准确率(%) × 0.1 - 错误次数 × 8
```

游戏结束自动跳转结算页（`/result`）。

### 结算页（`ResultView`）

- 得分 + 正确率展示
- 评级称号（按准确率）：90%+ → 🏆 顶级听音厨神 / 75-89% → 🥇 资深厨房大师 / 50-74% → 🥈 新手厨师学徒 / <50% → 🌱 听力有待提升
- 名字输入框（随机生成 20 形容词 × 21 名词组合，🎲 按钮可换名）
- "提交成绩到排行榜"按钮（手动提交，防止误操作）
- 排行榜三行：数据库 top 2 + 本局自己（黄色高亮）
- 超越百分比："你超越了 X% 的玩家"
- 厨房归位图：已收集物品按 `kitchenLayout` 坐标逐个弹跳出现
- 便签条随机文案 + "再来一局" / "返回首页"按钮

## 后端

- Express + TypeScript，监听 `127.0.0.1:3002`
- SQLite（`echotrace.db`）存储成绩，WAL 模式，零安装
- API：
  - `POST /api/results` — 提交成绩（返回 `percentile`）
  - `GET /api/leaderboard` — 查询排行榜
  - `GET /api/percentile?score=N` — 计算某分数超越百分比
  - `GET /api/health` — 健康检查
- pm2 进程管理（进程名 `echotrace2-api`）
- nginx 反代 `/api/` → `127.0.0.1:3002`
- 排行榜管理页：`/admin.html`（3 秒自动刷新）

## 部署

### 服务器配置

| 组件 | 端口/路径 |
|---|---|
| nginx 前端 | `:9090`（HTTPS 自签名） |
| 后端 API | `127.0.0.1:3002` |
| pm2 进程 | `echotrace2-api`、`cloudflared-tunnel` |
| 前端文件 | `/var/www/echotrace2/` |
| 后端文件 | `/opt/echotrace2-backend/` |

### HTTPS

- 自签名证书：`/etc/nginx/certs/echotrace2.{crt,key}`，有效期 10 年
- Cloudflare Tunnel 提供公网正规证书（微信/移动流量可用）
- 陀螺仪需要安全上下文（HTTPS），HTTP 下不可用

## 素材资源

### 场景图

```text
frontend/public/scenes/home-background.png   # 登录页
frontend/public/scenes/yulan.png             # 记忆页
frontend/public/scenes/game_background.png   # 听音挑战页
frontend/public/scenes/result-kitchen.jpg    # 结算页
```

### 厨具图标（/items/kitchen/，已压缩）

21 个 PNG。11 个有对应音效的目标物品，10 个无音效的干扰物品。物品清单见 `frontend/src/stores/game.ts` 中 `targetItems` 与 `distractorItems`。

### 音效

11 个厨具音效 .m4a（4 绵长 + 7 短促）+ 1 首背景音乐，AAC 128k 压缩。

## 组合函数

| 文件 | 用途 |
|---|---|
| `useGyroBasket.ts` | 读取 DeviceOrientation.gamma，平滑映射为收纳筐水平位置（0-100%）；iOS 13+ 自动请求权限，Android 直接读取 |
| `useGameSoundscape.ts` | 挑战页音景：背景乐铺底 + 厨具音效 Web Audio 截取循环 + 公平选择算法（优先未 offered、其次被选少的） + 无缝切换（先更新 activeItems 再异步加载 buffer）；三阶段按真实时间（0→18→38→60s）递进 |
| `useBackgroundMusic.ts` | 登录页 Web Audio 双振荡器环境音 |

## 数据模型

类型定义在 `frontend/src/types/game.ts`。物品数据在 `frontend/src/stores/game.ts`：

- `targetItems`：11 个有音效的目标物品（含 soundPath/soundType/volume/loopSec）
- `distractorItems`：10 个无音效干扰物品
- `FallingItem`：掉落物运行状态（含 `isTarget` 出生标记、`laneIdx` 轨道索引、`spawnedAt` 出生时间戳）
- `GameResult`：结算结果（score/accuracy/correctCount/wrongCount/totalKinds/placedItems）
- `pickTargets()`：每局随机抽 3 绵长 + 3 短促
- `saveResult()`：存储成绩到本地 + 同步 SQLite 排行榜

## 常用命令

- 前端安装依赖：`cd frontend && npm install`
- 前端启动：`cd frontend && npm run dev`
- 前端构建：`cd frontend && npm run build`
- 后端启动：`cd backend && npm run dev`
- 后端构建：`cd backend && npx tsc`
- 部署前端：`rsync -az --delete frontend/dist/ <server>:/var/www/echotrace2/`
- 部署后端：`rsync -az --exclude='node_modules' backend/ <server>:/opt/echotrace2-backend/`
- 重启后端：`ssh <server> "pm2 restart echotrace2-api"`
- 获取隧道地址：`ssh <server> "grep -oP 'https://[^ ]+trycloudflare\.com' ~/.pm2/logs/cloudflared-tunnel-error.log | tail -1"`

## 注意事项

- 敏感配置放入 `.env`，不要提交到仓库
- 数据库相关操作通过 service 层调用，不在 controller 中直接写 SQL
- `frontend/public/` 下的资源会以站点根路径访问
- 陀螺仪需要 HTTPS 安全上下文，HTTP 不可用
- Cloudflare Tunnel URL 在服务器/进程重启后会变，需重新获取
- 构建脚本使用 `vue-tsc --noEmit && vite build`
- 自签名证书首次访问浏览器会弹警告，点"高级 → 继续前往"即可
