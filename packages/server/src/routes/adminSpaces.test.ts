import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt } from '../utils/auth.js';

setWorkerId(11);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
let tusTmpDir: string;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

vi.mock('../config.js', async () => {
  const real = await import('../config.js');
  return {
    config: new Proxy(real.config, {
      get(target, prop: string) {
        if (prop === 'tusUploadDir') return tusTmpDir;
        return (target as Record<string, unknown>)[prop];
      },
    }),
  };
});

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sqlText = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    const statements = sqlText.split(/-->\s*statement-breakpoint/);
    for (const stmt of statements) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const { adminSpacesRoutes } = await import('./adminSpaces.js');
  const f = Fastify();
  await f.register(adminSpacesRoutes);
  return f;
}

const ADMIN_ID = 'admin-1';
const USER_ID = 'user-1';
const ADMIN_USERNAME = 'admin';
const USER_USERNAME = 'normie';

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });

  testDb.insert(schema.users).values([
    {
      id: ADMIN_ID,
      username: ADMIN_USERNAME,
      passwordHash: 'x',
      isAdmin: 1,
      createdAt: Date.now(),
    },
    {
      id: USER_ID,
      username: USER_USERNAME,
      passwordHash: 'x',
      isAdmin: 0,
      createdAt: Date.now(),
    },
  ]).run();

  seedSpace();
  tusTmpDir = path.join(os.tmpdir(), `backspace-admin-tus-${crypto.randomBytes(8).toString('hex')}`);
  app = await buildApp();
});

afterEach(() => {
  if (fs.existsSync(tusTmpDir)) {
    fs.rmSync(tusTmpDir, { recursive: true, force: true });
  }
});

function adminToken(): string {
  return signJwt({ userId: ADMIN_ID, username: ADMIN_USERNAME });
}

function userToken(): string {
  return signJwt({ userId: USER_ID, username: USER_USERNAME });
}

function seedSpace(): void {
  const now = Date.now();
  testDb.insert(schema.spaces).values({ id: 's1', name: 'Alpha Team', ownerId: USER_ID, createdAt: now }).run();
  testDb.insert(schema.spaces).values({ id: 's2', name: '100%_odd', ownerId: ADMIN_ID, createdAt: now - 1000 }).run();
  testDb.insert(schema.spaceMembers).values([
    { spaceId: 's1', userId: USER_ID, nickname: 'Boss', joinedAt: now },
  ]).run();
  testDb.insert(schema.roles).values({ id: 'r1', spaceId: 's1', name: 'Mods', color: '#fff', position: 1, createdAt: now }).run();
  testDb.insert(schema.memberRoles).values({ spaceId: 's1', userId: USER_ID, roleId: 'r1' }).run();
  testDb.insert(schema.channels).values([
    { id: 'c1', spaceId: 's1', name: 'general', type: 'text', position: 0, createdAt: now },
    { id: 'c2', spaceId: 's1', name: 'Lounge', type: 'voice', position: 1, createdAt: now },
  ]).run();
  for (let i = 1; i <= 5; i++) {
    testDb.insert(schema.messages).values({ id: String(1000 + i), channelId: 'c1', userId: USER_ID, content: `msg ${i}`, createdAt: now + i }).run();
  }
}

function get(url: string, token: string | null = adminToken()) {
  return app.inject({ method: 'GET', url, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe('admin spaces', () => {
  it('requires authentication and admin rights on every route', async () => {
    for (const url of ['/api/admin/spaces', '/api/admin/spaces/s1', '/api/admin/spaces/s1/channels/c1/messages']) {
      expect((await get(url, null)).statusCode).toBe(401);
      expect((await get(url, userToken())).statusCode).toBe(403);
    }
  });

  it('lists every space with counts and owner, newest first, even ones the admin is not in', async () => {
    const res = await get('/api/admin/spaces');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.spaces.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']);
    expect(body.spaces[0]).toMatchObject({ name: 'Alpha Team', memberCount: 1, channelCount: 2, owner: { id: USER_ID } });
  });

  it('searches by name and treats % and _ literally', async () => {
    expect((await get('/api/admin/spaces?q=alpha')).json().total).toBe(1);
    expect((await get('/api/admin/spaces?q=100%25_')).json().spaces.map((s: { id: string }) => s.id)).toEqual(['s2']);
    expect((await get('/api/admin/spaces?q=%25')).json().spaces.map((s: { id: string }) => s.id)).toEqual(['s2']);
  });

  it('returns members with nickname, roles and owner flag, plus channels', async () => {
    const res = await get('/api/admin/spaces/s1');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ id: USER_ID, nickname: 'Boss', isOwner: true, roles: [{ id: 'r1', name: 'Mods' }] });
    expect(body.members[0]).not.toHaveProperty('passwordHash');
    expect(body.channels.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
  });

  it('404s for an unknown space or a channel of another space', async () => {
    expect((await get('/api/admin/spaces/nope')).statusCode).toBe(404);
    expect((await get('/api/admin/spaces/s2/channels/c1/messages')).statusCode).toBe(404);
  });

  it('pages message history newest first and reports whether more remain', async () => {
    const first = (await get('/api/admin/spaces/s1/channels/c1/messages?limit=2')).json();
    expect(first.messages.map((m: { id: string }) => m.id)).toEqual(['1005', '1004']);
    expect(first.hasMore).toBe(true);
    const last = (await get('/api/admin/spaces/s1/channels/c1/messages?limit=10&before=1003')).json();
    expect(last.messages.map((m: { id: string }) => m.id)).toEqual(['1002', '1001']);
    expect(last.hasMore).toBe(false);
  });

  it('rejects a non-numeric cursor and returns no history for a voice channel', async () => {
    expect((await get('/api/admin/spaces/s1/channels/c1/messages?before=abc')).statusCode).toBe(400);
    expect((await get('/api/admin/spaces/s1/channels/c2/messages')).json()).toEqual({ messages: [], hasMore: false });
  });
});
