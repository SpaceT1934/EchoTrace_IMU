# EchoTrace（声迹）

手机端竖屏 WebApp 听觉记忆小游戏。

**核心玩法：** 在记忆阶段记住每种厨具的专属声音，然后在挑战阶段通过手机陀螺仪倾斜控制收纳筐接住正在发声的厨具——声音逐渐叠加，难度渐进提升。

## 游戏流程

```
首页（选难度）→ 记忆页（8s 记声音）→ 听音挑战页（60s）→ 结算页
```

每次进入游戏随机抽取 6 个厨具作为本局目标（3 绵长型 + 3 短促型）。听音挑战页声音按时间递进：0-18s 单音 → 18-38s 双音叠加 → 38-60s 三音叠加。手机倾斜控制收纳筐左右移动，接住目标物品得分，接错干扰项触发爆炸特效 + 屏幕震动。物品出生时标记 `isTarget`，终身不变，不会因声音切换而误判。

## 技术栈

### 前端
- **框架**: Vue 3 + Vite + TypeScript
- **状态管理**: Pinia
- **路由**: Vue Router（SPA history 模式）
- **交互**: DeviceOrientation API 陀螺仪控制收纳筐
- **音效**: AAC(.m4a) 厨具音效 + 背景音乐，Web Audio API 截取循环播放，无缝切换

### 后端
- **运行时**: Node.js + Express + TypeScript
- **数据库**: SQLite（better-sqlite3，零安装）
- **进程管理**: pm2 + nginx 反代

### 部署
- **HTTPS**: 自签名证书直连，Cloudflare Tunnel 作为移动流量备选
- **服务器**: 腾讯云 Ubuntu 22.04，端口 9090

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
│       ├── stores/          # gameStore（物品池 + 难度 + 排行榜）
│       ├── composables/     # useGyroBasket / useGameSoundscape / useBackgroundMusic
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
npm run dev        # 启动 Express API → http://localhost:3002
```

## 已实现功能

- 登录页：三种难度选择，随机抽本局目标
- 记忆页：8 秒倒计时、厨具依次弹动 + 播音效、音效预加载
- 听音挑战页：陀螺仪倾斜控制收纳筐、三阶段音效叠加（0-18/18-38/38-60s）、两大道单轨单物品、Web Audio 无缝循环截取、isTarget 出生标记、对错判定、点错爆炸/震动、实时分数显示
- 结算页：评级称号、排行榜 top 2 + 自己、超越百分比、名字输入、手动提交成绩、厨房归位逐帧动画
- 物品池：11 个有音效目标 + 10 个干扰项，随机 6 个目标/局
- 公平算法：保证所有目标都有机会被正确接住
- 后端 API：SQLite 成绩存储、排行榜查询、百分比计算
- 排行榜管理页：`/admin.html` 实时自动刷新
- 资源优化：图标/场景图压缩、音效转 AAC、图片预加载解码、首页背景图 preload
- 部署：HTTPS 自签名证书 + Cloudflare Tunnel，pm2 进程守护

## 访问地址

| 场景 | 地址 |
|---|---|
| 直连 HTTPS | `https://<服务器IP>:9090` |
| 隧道（移动流量/微信） | `https://<随机>.trycloudflare.com` |
| 排行榜管理 | `/admin.html`