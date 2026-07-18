/**
 * 춘구봇 닉 DB 서버 (Express + better-sqlite3)
 * - 채널별 닉 중복검사/등록을 영속 저장
 * - 봇(gongju-bot.js)의 NICK_API / BOT_KEY 와 짝을 맞추세요.
 *
 * ⚠️ Railway 는 재배포 시 파일시스템이 초기화됩니다.
 *    DB 를 유지하려면 Volume 을 붙이고 DB_PATH 를 그 경로로 지정하세요.
 *    예) Volume mount: /data  →  DB_PATH=/data/nicks.db
 */
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
app.use(express.json());

const BOT_KEY = process.env.BOT_KEY || "change-me";
const db = new Database(process.env.DB_PATH || "nicks.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS nicks (
    channelId TEXT NOT NULL,
    nick      TEXT NOT NULL,
    hash      TEXT NOT NULL,
    gender    TEXT,
    age       INTEGER,
    region    TEXT,
    createdAt INTEGER,
    PRIMARY KEY (channelId, nick)
  )
`);

// 인증 미들웨어
function auth(req, res, next) {
  if (req.headers["x-bot-key"] !== BOT_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// 닉 사용 가능 여부  → { available: bool }
app.post("/nick/check", auth, (req, res) => {
  const { channelId, nick, hash } = req.body || {};
  if (!channelId || !nick) return res.status(400).json({ error: "bad_request" });
  const row = db.prepare("SELECT hash FROM nicks WHERE channelId=? AND nick=?").get(channelId, nick);
  if (!row) return res.json({ available: true });
  // 같은 유저가 자기 닉을 재확인하는 경우는 사용가능으로 처리
  res.json({ available: row.hash === hash, ownedBySame: row.hash === hash });
});

// 온보딩 통과 시 닉 등록 (upsert)
app.post("/nick/register", auth, (req, res) => {
  const { channelId, nick, hash, gender, age, region } = req.body || {};
  if (!channelId || !nick || !hash) return res.status(400).json({ error: "bad_request" });
  const row = db.prepare("SELECT hash FROM nicks WHERE channelId=? AND nick=?").get(channelId, nick);
  if (row && row.hash !== hash) return res.status(409).json({ error: "taken" });
  db.prepare(`
    INSERT INTO nicks (channelId, nick, hash, gender, age, region, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channelId, nick) DO UPDATE SET
      hash=excluded.hash, gender=excluded.gender,
      age=excluded.age, region=excluded.region
  `).run(channelId, nick, hash, gender || null, age || null, region || null, Date.now());
  res.json({ ok: true });
});

// 관리자: 채널 닉 목록 조회
app.get("/nick/list", auth, (req, res) => {
  const { channelId } = req.query;
  if (!channelId) return res.status(400).json({ error: "bad_request" });
  const rows = db.prepare("SELECT nick, gender, age, region, createdAt FROM nicks WHERE channelId=? ORDER BY createdAt DESC").all(channelId);
  res.json({ count: rows.length, nicks: rows });
});

// 관리자: 닉 삭제(반납) — { channelId, nick }
app.post("/nick/release", auth, (req, res) => {
  const { channelId, nick } = req.body || {};
  if (!channelId || !nick) return res.status(400).json({ error: "bad_request" });
  const r = db.prepare("DELETE FROM nicks WHERE channelId=? AND nick=?").run(channelId, nick);
  res.json({ ok: true, removed: r.changes });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("nick server listening on " + PORT));
