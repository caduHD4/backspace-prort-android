import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt } from '../utils/auth.js';

setWorkerId(26);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { uploadDir } = vi.hoisted(() => ({ uploadDir: `${process.env.TMPDIR ?? '/tmp'}/backspace-avatar-crop-${process.pid}` }));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('../config.js', async (importActual) => {
  const actual = await importActual<typeof import('../config.js')>();
  return { ...actual, config: { ...actual.config, uploadDir } };
});
vi.mock('../ws/handler.js', () => ({
  connectionManager: {
    sendToUser: vi.fn(), sendToSpace: vi.fn(), sendToDmMembers: vi.fn(), setUserShowActivity: vi.fn(),
    clearUserActivities: vi.fn(), getUserStatus: vi.fn(() => 'online'), forceDisconnectUser: vi.fn(),
  },
}));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) {
      if (stmt.trim()) db.exec(stmt.trim());
    }
  }
}

const auth = (userId: string) => ({ Authorization: `Bearer ${signJwt({ userId, username: userId })}` });

/** A two-frame 120x80 GIF, written as an upload owned by `uploaderId`. */
async function uploadGif(filename: string, uploaderId: string): Promise<void> {
  const frame = (color: string) => sharp({ create: { width: 120, height: 80, channels: 3, background: color } }).raw().toBuffer();
  const frames = await Promise.all([frame('#ff0000'), frame('#0000ff')]);
  await sharp(Buffer.concat(frames), { raw: { width: 120, height: 80 * 2, channels: 3, pageHeight: 80 } })
    .gif({ delay: [100, 100], loop: 0 }).toFile(path.join(uploadDir, filename));
  testDb.insert(schema.attachments).values({
    id: `att-${filename}`, uploaderId, filename, originalName: 'avatar.gif', mimetype: 'image/gif',
    size: fs.statSync(path.join(uploadDir, filename)).size, createdAt: Date.now(),
  }).run();
}

beforeEach(async () => {
  fs.mkdirSync(uploadDir, { recursive: true });
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  for (const id of ['ana', 'bia']) {
    testDb.insert(schema.users).values({
      id, username: id, passwordHash: 'x', isAdmin: 0, isDeleted: 0, createdAt: Date.now(),
    }).run();
  }
  const { userRoutes } = await import('./users.js');
  app = Fastify({ logger: false });
  await app.register(userRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe('PATCH /api/users/@me with an avatar or banner crop', () => {
  it('crops every frame of an uploaded GIF, stores the copy and drops the upload', async () => {
    await uploadGif('up-1.gif', 'ana');

    const res = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('ana'),
      payload: { avatar: 'up-1.gif', avatarCrop: { x: 10, y: 0, width: 80, height: 80 } },
    });

    expect(res.statusCode).toBe(200);
    const avatar = testDb.select().from(schema.users).where(eq(schema.users.id, 'ana')).get()?.avatar;
    expect(avatar).toMatch(/\.gif$/);
    expect(avatar).not.toBe('up-1.gif');
    const stored = await sharp(path.join(uploadDir, avatar!), { animated: true }).metadata();
    expect(stored.pages).toBe(2);
    expect(stored.width).toBe(80);
    expect(stored.pageHeight).toBe(80);
    expect(fs.existsSync(path.join(uploadDir, 'up-1.gif'))).toBe(false);
    expect(testDb.select().from(schema.attachments).where(eq(schema.attachments.filename, 'up-1.gif')).get()).toBeUndefined();
  });

  it('crops a banner the same way', async () => {
    await uploadGif('up-2.gif', 'ana');
    const res = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('ana'),
      payload: { banner: 'up-2.gif', bannerCrop: { x: 0, y: 0, width: 120, height: 40 } },
    });
    expect(res.statusCode).toBe(200);
    const banner = testDb.select().from(schema.users).where(eq(schema.users.id, 'ana')).get()?.banner;
    const stored = await sharp(path.join(uploadDir, banner!), { animated: true }).metadata();
    expect(stored.width).toBe(120);
    expect(stored.pageHeight).toBe(40);
  });

  it("refuses a crop that leaves the image, another user's upload, and a crop without a GIF", async () => {
    await uploadGif('up-3.gif', 'ana');
    const crop = { x: 0, y: 0, width: 80, height: 80 };

    const outside = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('ana'),
      payload: { avatar: 'up-3.gif', avatarCrop: { x: 100, y: 0, width: 80, height: 80 } },
    });
    expect(outside.statusCode).toBe(400);

    const stranger = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('bia'),
      payload: { avatar: 'up-3.gif', avatarCrop: crop },
    });
    expect(stranger.statusCode).toBe(403);

    const notGif = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('ana'),
      payload: { avatar: 'up-3.png', avatarCrop: crop },
    });
    expect(notGif.statusCode).toBe(400);

    const noFile = await app.inject({
      method: 'PATCH', url: '/api/users/@me', headers: auth('ana'),
      payload: { avatarCrop: crop },
    });
    expect(noFile.statusCode).toBe(400);
    expect(fs.existsSync(path.join(uploadDir, 'up-3.gif'))).toBe(true);
  });
});
