import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'echotrace.db');

const db = new Database(dbPath);

// WAL 模式：允许并发读写，适合小型服务
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerName TEXT NOT NULL DEFAULT '厨房挑战者',
    score INTEGER NOT NULL DEFAULT 0,
    accuracy INTEGER NOT NULL DEFAULT 0,
    correctCount INTEGER NOT NULL DEFAULT 0,
    wrongCount INTEGER NOT NULL DEFAULT 0,
    totalKinds INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// 插入一条成绩
export function insertScore(record: {
  playerName: string;
  score: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  totalKinds: number;
}) {
  const stmt = db.prepare(`
    INSERT INTO scores (playerName, score, accuracy, correctCount, wrongCount, totalKinds)
    VALUES (@playerName, @score, @accuracy, @correctCount, @wrongCount, @totalKinds)
  `);
  return stmt.run(record);
}

// 计算某分数超过了百分之多少的玩家
export function getPercentile(score: number): number {
  const total = getTotalCount();
  if (total === 0) return 100;
  const row = db.prepare('SELECT COUNT(*) as cnt FROM scores WHERE score < ?').get(score) as { cnt: number };
  return Math.round((row.cnt / total) * 100);
}

// 查询排行榜 top N（按分数→准确率排序）
export function getLeaderboard(limit = 20) {
  const stmt = db.prepare(`
    SELECT id, playerName, score, accuracy, correctCount, wrongCount, totalKinds, createdAt
    FROM scores
    ORDER BY score DESC, accuracy DESC, createdAt ASC
    LIMIT ?
  `);
  return stmt.all(limit);
}

// 总提交次数
export function getTotalCount(): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM scores').get() as { cnt: number };
  return row.cnt;
}

