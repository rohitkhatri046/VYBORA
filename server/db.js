import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.VYBORA_DB_PATH || resolve(here, '..', 'data', 'vybora.sqlite'));
const dataDirectory = dirname(databasePath);
mkdirSync(dataDirectory, { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
