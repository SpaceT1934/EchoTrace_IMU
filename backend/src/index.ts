import express from 'express';
import cors from 'cors';
import { insertScore, getLeaderboard, getTotalCount, getPercentile } from './db.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors());
app.use(express.json());

// POST /api/results — 提交一局成绩
app.post('/api/results', (req, res) => {
  try {
    const { playerName, score, accuracy, correctCount, wrongCount, totalKinds } = req.body;

    if (
      typeof score !== 'number' ||
      typeof accuracy !== 'number' ||
      typeof correctCount !== 'number' ||
      typeof wrongCount !== 'number'
    ) {
      res.status(400).json({ error: '缺少必要字段 (score/accuracy/correctCount/wrongCount)' });
      return;
    }

    insertScore({
      playerName: String(playerName ?? '厨房挑战者').slice(0, 32),
      score,
      accuracy,
      correctCount,
      wrongCount,
      totalKinds: totalKinds ?? 0,
    });

    const percentile = getPercentile(score);
    res.json({ ok: true, percentile });
  } catch (err) {
    console.error('POST /api/results error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/leaderboard — 查询排行榜
app.get('/api/leaderboard', (_req, res) => {
  try {
    const rows = getLeaderboard(20);
    const total = getTotalCount();
    res.json({ rows, total });
  } catch (err) {
    console.error('GET /api/leaderboard error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// GET /api/percentile?score=N — 计算某分数超越百分比（不存库）
app.get('/api/percentile', (req, res) => {
  try {
    const score = parseInt(String(req.query.score ?? '0'), 10);
    const pct = getPercentile(score);
    const total = getTotalCount();
    res.json({ percentile: pct, total });
  } catch (err) {
    console.error('GET /api/percentile error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[EchoTrace API] listening on http://127.0.0.1:${PORT}`);
});
