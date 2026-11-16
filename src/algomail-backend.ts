import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const databasePath = process.env.ALGOMAIL_DATABASE_PATH || path.resolve('data/algomail.sqlite');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    sender_starred INTEGER NOT NULL DEFAULT 0,
    recipient_starred INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS messages_recipient_created ON messages(recipient_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS messages_sender_created ON messages(sender_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
`);

type PublicUser = { id: string; firstName: string; lastName: string; address: string };
type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  address: string;
  password_salt: string;
  password_hash: string;
};
type AuthRequest = Request & { algoMailUser?: PublicUser };

const captchaChallenges = new Map<string, { answer: number; expiresAt: number }>();
const attemptBuckets = new Map<string, { count: number; resetAt: number }>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function makeAddress(firstName: string, lastName: string): string {
  return `${normalizePart(firstName)}${normalizePart(lastName)}@afmail`;
}

function publicUser(row: Pick<UserRow, 'id' | 'first_name' | 'last_name' | 'address'>): PublicUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    address: row.address,
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function checkRateLimit(req: Request, key: string, limit = 12): boolean {
  const now = Date.now();
  const bucketKey = `${req.ip || 'unknown'}:${key}`;
  let bucket = attemptBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 15 * 60 * 1000 };
    attemptBuckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Devam etmek için AlgoMail hesabınıza giriş yapın.' });
    return;
  }

  const tokenHash = hashToken(match[1]);
  const row = db.prepare(`
    SELECT users.id, users.first_name, users.last_name, users.address
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, Date.now()) as Pick<UserRow, 'id' | 'first_name' | 'last_name' | 'address'> | undefined;

  if (!row) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?').run(tokenHash, Date.now());
    res.status(401).json({ error: 'Oturum süresi dolmuş. Yeniden giriş yapın.' });
    return;
  }

  req.algoMailUser = publicUser(row);
  next();
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const result = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return result.toString('hex');
}

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

function getUserRow(address: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE address = ? COLLATE NOCASE').get(address) as UserRow | undefined;
}

export const algoMailRouter = express.Router();
algoMailRouter.use(express.json({ limit: '128kb' }));

algoMailRouter.get('/captcha', (_req, res) => {
  const id = crypto.randomBytes(18).toString('base64url');
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  captchaChallenges.set(id, { answer: a + b, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ challengeId: id, question: `${a} + ${b} = ?` });
});

algoMailRouter.post('/register', async (req, res) => {
  if (!checkRateLimit(req, 'register', 8)) {
    res.status(429).json({ error: 'Çok fazla kayıt denemesi yapıldı. Bir süre sonra tekrar deneyin.' });
    return;
  }

  const firstName = String(req.body?.firstName ?? '').trim();
  const lastName = String(req.body?.lastName ?? '').trim();
  const password = String(req.body?.password ?? '');
  const challengeId = String(req.body?.challengeId ?? '');
  const captchaAnswer = String(req.body?.captchaAnswer ?? '').trim();
  const challenge = captchaChallenges.get(challengeId);
  captchaChallenges.delete(challengeId);

  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) {
    res.status(400).json({ error: 'İsim ve soyisim alanları gereklidir.' });
    return;
  }
  if (password.length < 10 || password.length > 200) {
    res.status(400).json({ error: 'Şifre en az 10 karakter olmalıdır.' });
    return;
  }
  if (!challenge || challenge.expiresAt <= Date.now() || captchaAnswer !== String(challenge.answer)) {
    res.status(400).json({ error: 'Güvenlik doğrulaması başarısız. Yeni CAPTCHA alın.' });
    return;
  }

  const address = makeAddress(firstName, lastName);
  if (!/^[a-z0-9]+@afmail$/.test(address)) {
    res.status(400).json({ error: 'Bu isimlerden geçerli AlgoMail kullanıcı adresi oluşturulamadı.' });
    return;
  }
  if (getUserRow(address)) {
    res.status(409).json({ error: 'Bu AlgoMail adresi kullanımda.' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = await passwordHash(password, salt);
    db.prepare(`
      INSERT INTO users (id, first_name, last_name, address, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, firstName, lastName, address, salt, digest, Date.now());
    const token = createSession(id);
    res.status(201).json({ user: { id, firstName, lastName, address }, token });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
      res.status(409).json({ error: 'Bu AlgoMail adresi kullanımda.' });
      return;
    }
    console.error('AlgoMail registration failed:', error);
    res.status(500).json({ error: 'Kayıt tamamlanamadı.' });
  }
});

algoMailRouter.post('/login', async (req, res) => {
  if (!checkRateLimit(req, 'login', 12)) {
    res.status(429).json({ error: 'Çok fazla giriş denemesi yapıldı. Bir süre sonra tekrar deneyin.' });
    return;
  }

  const address = String(req.body?.address ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = getUserRow(address);
  if (!user || password.length > 200) {
    res.status(401).json({ error: 'Adres veya şifre hatalı.' });
    return;
  }

  try {
    const supplied = Buffer.from(await passwordHash(password, user.password_salt), 'hex');
    const saved = Buffer.from(user.password_hash, 'hex');
    if (supplied.length !== saved.length || !crypto.timingSafeEqual(supplied, saved)) {
      res.status(401).json({ error: 'Adres veya şifre hatalı.' });
      return;
    }
    const token = createSession(user.id);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    console.error('AlgoMail login failed:', error);
    res.status(500).json({ error: 'Giriş yapılamadı.' });
  }
});

algoMailRouter.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.algoMailUser });
});

algoMailRouter.post('/logout', requireAuth, (req: AuthRequest, res) => {
  const match = (req.header('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  if (match) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(match[1]));
  res.json({ ok: true });
});

algoMailRouter.get('/messages', requireAuth, (req: AuthRequest, res) => {
  const user = req.algoMailUser!;
  const folder = String(req.query.folder ?? 'inbox');
  if (folder !== 'inbox' && folder !== 'sent') {
    res.status(400).json({ error: 'Geçersiz klasör.' });
    return;
  }

  const column = folder === 'sent' ? 'sender_id' : 'recipient_id';
  const rows = db.prepare(`
    SELECT messages.id, messages.subject, messages.body, messages.created_at, messages.read_at,
      messages.sender_starred, messages.recipient_starred,
      sender.id AS sender_id, sender.first_name AS sender_first_name,
      sender.last_name AS sender_last_name, sender.address AS sender_address,
      recipient.address AS recipient_address
    FROM messages
    JOIN users AS sender ON sender.id = messages.sender_id
    JOIN users AS recipient ON recipient.id = messages.recipient_id
    WHERE messages.${column} = ?
    ORDER BY messages.created_at DESC
    LIMIT 200
  `).all(user.id) as Array<{
    id: string; subject: string; body: string; created_at: number; read_at: number | null;
    sender_starred: number; recipient_starred: number; sender_id: string;
    sender_first_name: string; sender_last_name: string; sender_address: string;
    recipient_address: string;
  }>;

  res.json({ messages: rows.map((row) => ({
    id: row.id,
    from: row.sender_first_name + ' ' + row.sender_last_name,
    fromAddress: row.sender_address,
    toAddress: row.recipient_address,
    subject: row.subject,
    body: row.body,
    preview: row.body.slice(0, 120),
    createdAt: row.created_at,
    unread: folder === 'inbox' && row.read_at === null,
    starred: Boolean(folder === 'sent' ? row.sender_starred : row.recipient_starred),
  })) });
});

algoMailRouter.post('/messages', requireAuth, (req: AuthRequest, res) => {
  const sender = req.algoMailUser!;
  const recipientAddress = String(req.body?.toAddress ?? '').trim().toLowerCase();
  const subject = String(req.body?.subject ?? '').trim();
  const body = String(req.body?.body ?? '').trim();

  if (!/^[a-z0-9]+@afmail$/.test(recipientAddress)) {
    res.status(400).json({ error: 'Alıcı adresi geçerli bir @afmail kullanıcı adresi olmalıdır.' });
    return;
  }
  if (subject.length < 1 || subject.length > 200 || body.length < 1 || body.length > 20_000) {
    res.status(400).json({ error: 'Konu ve mesaj gereklidir. Konu en fazla 200, mesaj 20.000 karakter olabilir.' });
    return;
  }
  const recipient = getUserRow(recipientAddress);
  if (!recipient) {
    res.status(404).json({ error: 'Bu AlgoMail kullanıcısı bulunamadı.' });
    return;
  }
  if (recipient.id === sender.id) {
    res.status(400).json({ error: 'Kendinize mesaj gönderemezsiniz.' });
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(`
    INSERT INTO messages (id, sender_id, recipient_id, subject, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sender.id, recipient.id, subject, body, createdAt);
  res.status(201).json({
    message: { id, from: sender.address, toAddress: recipient.address, subject, body, createdAt, unread: false },
  });
});

algoMailRouter.get('/messages/:id', requireAuth, (req: AuthRequest, res) => {
  const user = req.algoMailUser!;
  const row = db.prepare(`
    SELECT messages.id, messages.subject, messages.body, messages.created_at, messages.read_at,
      messages.sender_starred, messages.recipient_starred,
      sender.first_name AS sender_first_name, sender.last_name AS sender_last_name,
      sender.address AS sender_address, recipient.address AS recipient_address
    FROM messages
    JOIN users AS sender ON sender.id = messages.sender_id
    JOIN users AS recipient ON recipient.id = messages.recipient_id
    WHERE messages.id = ? AND (messages.sender_id = ? OR messages.recipient_id = ?)
  `).get(req.params.id, user.id, user.id) as {
    id: string; subject: string; body: string; created_at: number; read_at: number | null;
    sender_starred: number; recipient_starred: number; sender_first_name: string;
    sender_last_name: string; sender_address: string; recipient_address: string;
  } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }
  if (row.recipient_address === user.address && row.read_at === null) {
    db.prepare('UPDATE messages SET read_at = ? WHERE id = ?').run(Date.now(), row.id);
  }
  res.json({ message: {
    id: row.id,
    from: `${row.sender_first_name} ${row.sender_last_name}`,
    fromAddress: row.sender_address,
    toAddress: row.recipient_address,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    unread: row.recipient_address === user.address && row.read_at === null,
    starred: Boolean(row.recipient_address === user.address ? row.recipient_starred : row.sender_starred),
  } });
});

algoMailRouter.patch('/messages/:id/star', requireAuth, (req: AuthRequest, res) => {
  const user = req.algoMailUser!;
  const row = db.prepare('SELECT sender_id, recipient_id FROM messages WHERE id = ?')
    .get(req.params.id) as { sender_id: string; recipient_id: string } | undefined;
  if (!row || (row.sender_id !== user.id && row.recipient_id !== user.id)) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }

  const starred = req.body?.starred === true;
  const column = row.sender_id === user.id ? 'sender_starred' : 'recipient_starred';
  db.prepare(`UPDATE messages SET ${column} = ? WHERE id = ?`).run(starred ? 1 : 0, req.params.id);
  res.json({ ok: true, starred });
});
