import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const schema = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

test('social schema creates core tables, indexes, and enforced constraints', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name);
    for (const table of ['users', 'sessions', 'media_assets', 'posts', 'follows', 'reactions', 'bookmarks', 'comments', 'messages', 'stories', 'notifications']) {
      assert.ok(tables.includes(table), `Expected ${table} table`);
    }

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name);
    assert.ok(indexes.includes('idx_posts_created'));
    assert.ok(indexes.includes('idx_bookmarks_user_created'));
    assert.ok(indexes.includes('idx_messages_sender_created'));

    db.prepare(`INSERT INTO users (id, username, name, email, password_hash) VALUES ('u1', 'one', 'One Person', 'one@example.com', 'hash')`).run();
    assert.throws(() => db.prepare(`
      INSERT INTO users (id, username, name, email, password_hash) VALUES ('u2', 'one', 'Duplicate', 'two@example.com', 'hash')
    `).run(), /UNIQUE constraint failed/);
    assert.throws(() => db.prepare(`
      INSERT INTO posts (id, user_id, audience) VALUES ('bad-audience', 'u1', 'everyone')
    `).run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare(`
      INSERT INTO follows (follower_id, followed_id) VALUES ('u1', 'u1')
    `).run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, body) VALUES ('self-message', 'u1', 'u1', 'hello')
    `).run(), /CHECK constraint failed/);
  } finally {
    db.close();
  }
});
