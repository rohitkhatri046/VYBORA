import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileTypeFromFile } from 'file-type';
import { z } from 'zod';
import { db } from './db.js';

const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const uploadsDirectory = resolve(process.env.VYBORA_UPLOADS_DIR || resolve(root, 'uploads'));
mkdirSync(uploadsDirectory, { recursive: true });

const production = process.env.NODE_ENV === 'production';
const sessionDays = Math.min(Math.max(Number(process.env.SESSION_DAYS) || 14, 1), 30);
const cookieName = production ? '__Host-vybora' : 'vybora_session';
const userById = db.prepare(`
  SELECT id, username, name, email, bio, location, avatar_url AS avatarUrl,
    is_private AS isPrivate, created_at AS createdAt
  FROM users WHERE id = ?
`);
const safeUser = (id) => userById.get(id);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const id = () => randomUUID();

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.get('/healthz', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ status: 'ok' });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, uploadsDirectory),
    filename: (_req, file, done) => done(null, `${randomUUID()}${file.detectedExtension}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    const allowed = new Map([
      ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'],
      ['video/mp4', '.mp4'], ['video/webm', '.webm'],
    ]);
    const extension = allowed.get(file.mimetype);
    if (!extension) return done(new Error('Upload a JPG, PNG, WebP, GIF, MP4, or WebM file.'));
    file.detectedExtension = extension;
    done(null, true);
  },
});

function csrfGuard(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  let parsedOrigin;
  try { parsedOrigin = new URL(origin).origin; }
  catch { return res.status(403).json({ error: 'Request origin is not allowed.' }); }
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const devOrigin = !production && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(parsedOrigin);
  if (parsedOrigin === requestOrigin || (!production && devOrigin)) return next();
  return res.status(403).json({ error: 'Request origin is not allowed.' });
}
app.use('/api', csrfGuard);

function setSessionCookie(res, token) {
  const expires = new Date(Date.now() + sessionDays * 86400000);
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
}

function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDays * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hash(token), userId, expiresAt);
  setSessionCookie(res, token);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[cookieName];
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  const session = db.prepare('SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?')
    .get(hash(token));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
  req.user = safeUser(session.userId);
  if (!req.user) return res.status(401).json({ error: 'Account no longer exists.' });
  next();
}

function validate(schema, input) {
  const result = schema.safeParse(input);
  return result.success ? { data: result.data } : { error: result.error.issues[0]?.message || 'Invalid input.' };
}

function canViewPost(postId, viewerId) {
  const post = db.prepare(`
    SELECT p.user_id AS userId, p.audience, u.is_private AS isPrivate
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(postId);
  if (!post) return false;
  if (post.userId === viewerId) return true;
  if (post.audience === 'private' || post.isPrivate) return false;
  if (post.audience === 'followers') {
    return Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?')
      .get(viewerId, post.userId));
  }
  return true;
}

function requirePostAccess(req, res, next) {
  if (!canViewPost(req.params.id, req.user.id)) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_.]+$/, 'Username can use letters, numbers, underscores, and periods.'),
  email: z.email().max(254),
  password: z.string().min(10).max(72),
});
const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
});
const postSchema = z.object({
  body: z.string().trim().max(2000).default(''),
  mediaUrl: z.string().max(300).optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  audience: z.enum(['public', 'followers', 'private']).default('public'),
}).refine((value) => value.body.length > 0 || value.mediaUrl, 'Write something or attach a photo/video.')
  .refine((value) => Boolean(value.mediaUrl) === Boolean(value.mediaType), 'Choose both a verified upload and its media type.');
const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const reactionSchema = z.object({ kind: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry']).default('like') });
const profileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(160).default(''),
  location: z.string().trim().max(80).default(''),
  isPrivate: z.boolean().default(false),
  avatarUrl: z.string().max(300).optional(),
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'vybora-api' }));

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { data, error } = validate(registerSchema, req.body);
  if (error) return res.status(400).json({ error });
  const username = data.username.toLowerCase();
  const email = data.email.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE username = ? OR email = ?').get(username, email)) {
    return res.status(409).json({ error: 'That email or username is already in use.' });
  }
  const userId = id();
  db.prepare('INSERT INTO users (id, username, name, email, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(userId, username, data.name, email, bcrypt.hashSync(data.password, 12));
  createSession(userId, res);
  res.status(201).json({ user: safeUser(userId) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { data, error } = validate(loginSchema, req.body);
  if (error) return res.status(400).json({ error });
  const identifier = data.identifier.toLowerCase();
  const account = db.prepare('SELECT id, password_hash AS passwordHash FROM users WHERE email = ? OR username = ? OR phone = ?')
    .get(identifier, identifier, data.identifier);
  if (!account || !bcrypt.compareSync(data.password, account.passwordHash)) {
    return res.status(401).json({ error: 'Email/username or password is incorrect.' });
  }
  createSession(account.id, res);
  res.json({ user: safeUser(account.id) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[cookieName];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
  clearSessionCookie(res);
  res.status(204).end();
});

app.post('/api/auth/logout-all', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/users/:username', (req, res) => {
  const profile = db.prepare(`
    SELECT id, username, name, bio, location, avatar_url AS avatarUrl, is_private AS isPrivate,
      created_at AS createdAt,
      (SELECT count(*) FROM follows WHERE followed_id = users.id) AS followerCount,
      (SELECT count(*) FROM follows WHERE follower_id = users.id) AS followingCount,
      (SELECT count(*) FROM posts WHERE user_id = users.id) AS postCount
    FROM users WHERE username = ? COLLATE NOCASE
  `).get(req.params.username);
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  const viewerId = req.cookies?.[cookieName]
    ? db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(hash(req.cookies[cookieName]), new Date().toISOString())?.user_id
    : null;
  const isFollowing = viewerId
    ? Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(viewerId, profile.id))
    : false;
  res.json({ profile, isFollowing, isSelf: viewerId === profile.id });
});

app.get('/api/users/:username/posts', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT id, is_private AS isPrivate FROM users WHERE username = ? COLLATE NOCASE')
    .get(req.params.username);
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  const isFollowing = Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?')
    .get(req.user.id, profile.id));
  if (profile.isPrivate && !isFollowing && profile.id !== req.user.id) {
    return res.status(403).json({ error: 'Follow this private account to see their posts.' });
  }
  const posts = db.prepare(`
    ${postSelect}
    WHERE p.user_id = ? AND (p.audience != 'private' OR p.user_id = ?)
      AND (p.audience != 'followers' OR ? = p.user_id OR ? = 1)
    ORDER BY p.created_at DESC LIMIT 30
  `).all(profile.id, req.user.id, req.user.id, Number(isFollowing))
    .map((post) => decoratePost(post, req.user.id));
  res.json({ posts });
});

app.patch('/api/profile', requireAuth, (req, res) => {
  const { data, error } = validate(profileSchema, req.body);
  if (error) return res.status(400).json({ error });
  const avatarUrl = data.avatarUrl ?? req.user.avatarUrl;
  if (avatarUrl) {
    const filename = avatarUrl.startsWith('/api/media/') ? avatarUrl.slice('/api/media/'.length) : '';
    const media = db.prepare('SELECT mime_type AS mimeType FROM media_assets WHERE filename = ? AND owner_id = ?')
      .get(filename, req.user.id);
    if (!media || !media.mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Profile photos must use your verified uploaded image.' });
    }
  }
  db.prepare('UPDATE users SET name = ?, bio = ?, location = ?, is_private = ?, avatar_url = ? WHERE id = ?')
    .run(data.name, data.bio, data.location, Number(data.isPrivate), avatarUrl, req.user.id);
  res.json({ user: safeUser(req.user.id) });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const threads = db.prepare(`
    WITH ranked AS (
      SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS peerId,
        id, body, sender_id AS senderId, created_at AS createdAt,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END
          ORDER BY created_at DESC, rowid DESC
        ) AS position
      FROM messages
      WHERE sender_id = ? OR recipient_id = ?
    )
    SELECT ranked.peerId AS id, u.username, u.name, u.avatar_url AS avatarUrl,
      ranked.body AS lastMessage, ranked.senderId AS lastSenderId, ranked.createdAt
    FROM ranked JOIN users u ON u.id = ranked.peerId
    WHERE ranked.position = 1
    ORDER BY ranked.createdAt DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json({ threads });
});

app.get('/api/messages/:peerId', requireAuth, (req, res) => {
  if (req.params.peerId === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });
  const peer = db.prepare('SELECT id, username, name, avatar_url AS avatarUrl FROM users WHERE id = ?')
    .get(req.params.peerId);
  if (!peer) return res.status(404).json({ error: 'User not found.' });
  const messages = db.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, created_at AS createdAt
    FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY created_at DESC, rowid DESC LIMIT 200
  `).all(req.user.id, peer.id, peer.id, req.user.id).reverse();
  res.json({ peer, messages });
});

app.post('/api/messages/:peerId', requireAuth, (req, res) => {
  if (req.params.peerId === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });
  const peer = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.peerId);
  if (!peer) return res.status(404).json({ error: 'User not found.' });
  const { data, error } = validate(messageSchema, req.body);
  if (error) return res.status(400).json({ error });
  const message = {
    id: id(),
    senderId: req.user.id,
    recipientId: peer.id,
    body: data.body,
    createdAt: new Date().toISOString(),
  };
  db.transaction(() => {
    db.prepare('INSERT INTO messages (id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(message.id, message.senderId, message.recipientId, message.body, message.createdAt);
    db.prepare('INSERT INTO notifications (id, user_id, actor_id, kind) VALUES (?, ?, ?, ?)')
      .run(id(), message.recipientId, message.senderId, 'message');
  })();
  res.status(201).json({ message });
});

app.post('/api/media', requireAuth, (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) return res.status(400).json({ error: error.message || 'Could not upload this file.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a photo or video to upload.' });
    fileTypeFromFile(req.file.path).then((detected) => {
      const matchesDeclaration = detected
        && detected.mime === req.file.mimetype
        && detected.mime.startsWith(req.file.mimetype.startsWith('video/') ? 'video/' : 'image/');
      if (!matchesDeclaration) {
        unlinkSync(req.file.path);
        return res.status(400).json({ error: 'This file does not match its declared image or video type.' });
      }
      db.prepare('INSERT INTO media_assets (filename, owner_id, mime_type) VALUES (?, ?, ?)')
        .run(req.file.filename, req.user.id, detected.mime);
      res.status(201).json({
        url: `/api/media/${req.file.filename}`,
        type: detected.mime.startsWith('video/') ? 'video' : 'image',
      });
    }).catch((issue) => {
      unlinkSync(req.file.path);
      res.status(400).json({ error: issue.message || 'Could not verify this uploaded file.' });
    });
  });
});

const postSelect = `
  SELECT p.id, p.user_id AS userId, p.body, p.media_url AS mediaUrl, p.media_type AS mediaType,
    p.audience, p.created_at AS createdAt, u.username, u.name, u.avatar_url AS avatarUrl,
    (SELECT count(*) FROM reactions r WHERE r.post_id = p.id) AS reactionCount,
    (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS commentCount
  FROM posts p JOIN users u ON u.id = p.user_id
`;
const decoratePost = (post, viewerId) => ({
  ...post,
  viewerReaction: viewerId
    ? db.prepare('SELECT kind FROM reactions WHERE user_id = ? AND post_id = ?').get(viewerId, post.id)?.kind || null
    : null,
  viewerSaved: viewerId
    ? Boolean(db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?').get(viewerId, post.id))
    : false,
});

app.get('/api/feed', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const cursorPost = cursor ? db.prepare('SELECT created_at AS createdAt, id FROM posts WHERE id = ?').get(cursor) : null;
  if (cursor && !cursorPost) return res.status(400).json({ error: 'Feed cursor is invalid.' });
  const rows = db.prepare(`
    ${postSelect}
    WHERE (p.audience = 'public'
      OR p.user_id = ?
      OR (p.audience = 'followers' AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.user_id
      )))
      AND (u.is_private = 0 OR p.user_id = ? OR EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.user_id
      ))
      AND (? IS NULL OR (p.created_at, p.id) < (?, ?))
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?
  `).all(req.user.id, req.user.id, req.user.id, req.user.id,
    cursor, cursorPost?.createdAt || null, cursorPost?.id || null, limit + 1);
  const hasMore = rows.length > limit;
  const posts = rows.slice(0, limit).map((post) => decoratePost(post, req.user.id));
  res.json({ posts, nextCursor: hasMore ? posts.at(-1)?.id : null });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { data, error } = validate(postSchema, req.body);
  if (error) return res.status(400).json({ error });
  if (data.mediaUrl) {
    const filename = data.mediaUrl.startsWith('/api/media/') ? data.mediaUrl.slice('/api/media/'.length) : '';
    const media = db.prepare('SELECT mime_type AS mimeType FROM media_assets WHERE filename = ? AND owner_id = ?')
      .get(filename, req.user.id);
    if (!media || !filename || media.mimeType.startsWith('video/') !== (data.mediaType === 'video')) {
      return res.status(400).json({ error: 'Posts must use your verified uploaded media.' });
    }
  }
  const postId = id();
  db.prepare('INSERT INTO posts (id, user_id, body, media_url, media_type, audience) VALUES (?, ?, ?, ?, ?, ?)')
    .run(postId, req.user.id, data.body, data.mediaUrl || null, data.mediaType || null, data.audience);
  res.status(201).json({ post: decoratePost(db.prepare(`${postSelect} WHERE p.id = ?`).get(postId), req.user.id) });
});

app.get('/api/posts/:id', requireAuth, requirePostAccess, (req, res) => {
  const post = db.prepare(`${postSelect} WHERE p.id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json({ post: decoratePost(post, req.user.id) });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Post not found or you cannot delete it.' });
  res.status(204).end();
});

app.put('/api/posts/:id/reaction', requireAuth, requirePostAccess, (req, res) => {
  const { data, error } = validate(reactionSchema, req.body);
  if (error) return res.status(400).json({ error });
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  db.prepare('INSERT INTO reactions (user_id, post_id, kind) VALUES (?, ?, ?) ON CONFLICT(user_id, post_id) DO UPDATE SET kind = excluded.kind')
    .run(req.user.id, req.params.id, data.kind);
  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (post.user_id !== req.user.id) {
    db.prepare('INSERT INTO notifications (id, user_id, actor_id, kind, post_id) VALUES (?, ?, ?, ?, ?)')
      .run(id(), post.user_id, req.user.id, 'reaction', req.params.id);
  }
  res.json({ reactionCount: db.prepare('SELECT count(*) AS count FROM reactions WHERE post_id = ?').get(req.params.id).count });
});

app.delete('/api/posts/:id/reaction', requireAuth, requirePostAccess, (req, res) => {
  db.prepare('DELETE FROM reactions WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  res.status(204).end();
});

app.put('/api/posts/:id/bookmark', requireAuth, requirePostAccess, (req, res) => {
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)').run(req.user.id, req.params.id);
  res.json({ saved: true });
});

app.delete('/api/posts/:id/bookmark', requireAuth, requirePostAccess, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  res.json({ saved: false });
});

app.get('/api/posts/:id/comments', requireAuth, requirePostAccess, (req, res) => {
  const comments = db.prepare(`
    SELECT c.id, c.body, c.created_at AS createdAt, u.id AS userId,
      u.username, u.name, u.avatar_url AS avatarUrl
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 100
  `).all(req.params.id);
  res.json({ comments });
});

app.post('/api/posts/:id/comments', requireAuth, requirePostAccess, (req, res) => {
  const { data, error } = validate(commentSchema, req.body);
  if (error) return res.status(400).json({ error });
  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const commentId = id();
  db.prepare('INSERT INTO comments (id, user_id, post_id, body) VALUES (?, ?, ?, ?)')
    .run(commentId, req.user.id, req.params.id, data.body);
  if (post.user_id !== req.user.id) {
    db.prepare('INSERT INTO notifications (id, user_id, actor_id, kind, post_id) VALUES (?, ?, ?, ?, ?)')
      .run(id(), post.user_id, req.user.id, 'comment', req.params.id);
  }
  const comment = db.prepare(`
    SELECT c.id, c.body, c.created_at AS createdAt, u.id AS userId,
      u.username, u.name, u.avatar_url AS avatarUrl
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(commentId);
  res.status(201).json({ comment });
});

app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself.' });
  const target = safeUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const result = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)')
    .run(req.user.id, req.params.id);
  if (result.changes) {
    db.prepare('INSERT INTO notifications (id, user_id, actor_id, kind) VALUES (?, ?, ?, ?)')
      .run(id(), req.params.id, req.user.id, 'follow');
  }
  res.json({ following: true });
});

app.delete('/api/users/:id/follow', requireAuth, (req, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(req.user.id, req.params.id);
  res.json({ following: false });
});

app.get('/api/search', requireAuth, (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
  if (query.length < 2) return res.json({ users: [], posts: [] });
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const users = db.prepare(`
    SELECT id, username, name, bio, avatar_url AS avatarUrl
    FROM users WHERE id != ? AND (username LIKE ? OR name LIKE ?)
      AND (is_private = 0 OR id = ? OR EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = users.id
      ))
    ORDER BY name LIMIT 10
  `).all(req.user.id, pattern, pattern, req.user.id, req.user.id);
  const matchingPosts = db.prepare(`
    ${postSelect}
    WHERE p.body LIKE ? ESCAPE '\\'
      AND (p.audience = 'public' OR p.user_id = ? OR (p.audience = 'followers'
        AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.user_id)))
      AND (u.is_private = 0 OR p.user_id = ? OR EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.user_id
      ))
    ORDER BY p.created_at DESC LIMIT 10
  `).all(pattern, req.user.id, req.user.id, req.user.id, req.user.id)
    .map((post) => decoratePost(post, req.user.id));
  res.json({ users, posts: matchingPosts });
});

app.get('/api/suggestions', requireAuth, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url AS avatarUrl,
      (SELECT count(*) FROM follows f WHERE f.followed_id = u.id) AS followerCount
    FROM users u WHERE u.id != ? AND u.is_private = 0
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = u.id)
    ORDER BY followerCount DESC, u.created_at DESC LIMIT 8
  `).all(req.user.id, req.user.id);
  res.json({ users });
});

app.get('/api/trends', requireAuth, (_req, res) => {
  const posts = db.prepare(`
    SELECT p.body FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.audience = 'public' AND u.is_private = 0 AND p.created_at >= datetime('now', '-7 days')
    ORDER BY created_at DESC LIMIT 500
  `).all();
  const counts = new Map();
  for (const { body } of posts) {
    for (const match of body.matchAll(/#[\p{L}\p{N}_]+/gu)) {
      const tag = match[0].slice(1);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  res.json({ trends: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([tag, count]) => ({ tag, count })) });
});

app.get('/api/stories', requireAuth, (req, res) => {
  const stories = db.prepare(`
    SELECT s.id, s.media_url AS mediaUrl, s.media_type AS mediaType, s.created_at AS createdAt,
      s.expires_at AS expiresAt, u.id AS userId, u.username, u.name, u.avatar_url AS avatarUrl,
      u.is_private AS isPrivate
    FROM stories s JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > ? AND (u.is_private = 0 OR u.id = ? OR EXISTS (
      SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = u.id
    ))
    ORDER BY s.created_at DESC LIMIT 100
  `).all(new Date().toISOString(), req.user.id, req.user.id);
  res.json({ stories });
});

app.post('/api/stories', requireAuth, (req, res) => {
  const schema = z.object({ mediaUrl: z.string().min(1).max(300), mediaType: z.enum(['image', 'video']) });
  const { data, error } = validate(schema, req.body);
  if (error) return res.status(400).json({ error });
  const filename = data.mediaUrl.startsWith('/api/media/') ? data.mediaUrl.slice('/api/media/'.length) : '';
  const media = db.prepare('SELECT mime_type AS mimeType FROM media_assets WHERE filename = ? AND owner_id = ?')
    .get(filename, req.user.id);
  if (!media || !filename || media.mimeType.startsWith('video/') !== (data.mediaType === 'video')) {
    return res.status(400).json({ error: 'Stories must use your verified uploaded media.' });
  }
  const storyId = id();
  db.prepare('INSERT INTO stories (id, user_id, media_url, media_type, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(storyId, req.user.id, data.mediaUrl, data.mediaType, new Date(Date.now() + 86400000).toISOString());
  res.status(201).json({ id: storyId });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT n.id, n.kind, n.actor_id AS actorId, n.created_at AS createdAt, n.read_at AS readAt,
      n.post_id AS postId, u.username, u.name, u.avatar_url AS avatarUrl
    FROM notifications n JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 30
  `).all(req.user.id);
  res.json({ notifications });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read_at = datetime(\'now\') WHERE user_id = ? AND read_at IS NULL')
    .run(req.user.id);
  res.status(204).end();
});

app.get('/api/media/:filename', requireAuth, (req, res) => {
  const media = db.prepare('SELECT owner_id AS ownerId, mime_type AS mimeType FROM media_assets WHERE filename = ?')
    .get(req.params.filename);
  if (!media) return res.status(404).json({ error: 'Media not found.' });
  const post = db.prepare('SELECT id FROM posts WHERE media_url = ?').get(`/api/media/${req.params.filename}`);
  const profileAvatar = db.prepare('SELECT id FROM users WHERE avatar_url = ?')
    .get(`/api/media/${req.params.filename}`);
  const story = db.prepare(`
    SELECT s.user_id AS userId, u.is_private AS isPrivate FROM stories s
    JOIN users u ON u.id = s.user_id
    WHERE s.media_url = ? AND s.expires_at > ?
  `).get(`/api/media/${req.params.filename}`, new Date().toISOString());
  const storyIsVisible = story && (!story.isPrivate || story.userId === req.user.id
    || db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?')
      .get(req.user.id, story.userId));
  if (media.ownerId !== req.user.id && (!post || !canViewPost(post.id, req.user.id))
    && !storyIsVisible && !profileAvatar) {
    return res.status(404).json({ error: 'Media not found.' });
  }
  res.type(media.mimeType);
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(resolve(uploadsDirectory, req.params.filename));
});

if (production) {
  app.use(express.static(resolve(root, 'dist')));
  app.get('*splat', (_req, res) => res.sendFile(resolve(root, 'dist', 'index.html')));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That email or username is already in use.' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(port, host, () => {
  console.log(`VYBORA API listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
