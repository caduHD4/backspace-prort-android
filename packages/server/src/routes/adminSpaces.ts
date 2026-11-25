import type { FastifyInstance } from 'fastify';
import { eq, and, sql, asc, desc, lt, inArray } from 'drizzle-orm';
import { authenticate, requireAdmin } from '../utils/auth.js';
import { getDb, schema } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';
import type {
  AdminSpaceChannel,
  AdminSpaceDetail,
  AdminSpaceListResponse,
  AdminSpaceMember,
  AdminSpaceMessage,
  AdminSpaceMessagesResponse,
  AdminSpacePerson,
  AdminSpaceSummary,
} from '@backspace/shared';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

type UserRow = typeof schema.users.$inferSelect;

function toPerson(row: UserRow): AdminSpacePerson {
  const deleted = row.isDeleted === 1;
  return {
    id: row.id,
    username: deleted ? 'Deleted User' : row.username,
    displayName: deleted ? null : row.displayName,
    avatar: deleted ? null : row.avatar,
    avatarColor: deleted ? null : row.avatarColor,
    homeInstance: deleted ? null : row.homeInstance,
    isDeleted: deleted,
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** `%` and `_` are wildcards in LIKE; a search for them should match them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function summarize(space: typeof schema.spaces.$inferSelect, owner: UserRow | undefined, memberCount: number, channelCount: number): AdminSpaceSummary {
  return {
    id: space.id,
    name: space.name,
    icon: space.icon,
    avatarColor: space.avatarColor,
    visibility: space.visibility ?? 'private',
    memberCount,
    channelCount,
    createdAt: space.createdAt,
    owner: owner ? toPerson(owner) : null,
  };
}

/**
 * Read-only view of every space on the instance for the instance admin.
 *
 * The admin does not join the space, appears in no member list, and nothing
 * here writes: it is a window onto data the admin already holds the database
 * for. Every look at a space's members or messages is logged with the admin's
 * id so the access leaves a trace in the server log.
 */
export async function adminSpacesRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [authenticate, requireAdmin] };

  // GET /api/admin/spaces — every space on the instance, newest first
  app.get<{ Querystring: { q?: string; page?: string; pageSize?: string } }>(
    '/api/admin/spaces',
    guard,
    async (request, reply) => {
      const db = getDb();
      const page = clampInt(request.query.page, 1, 1, 100_000);
      const pageSize = clampInt(request.query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
      const q = request.query.q?.trim();
      const where = q ? sql`${schema.spaces.name} LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'` : undefined;

      const total = db.select({ count: sql<number>`count(*)` }).from(schema.spaces).where(where).get()?.count ?? 0;
      const rows = db.select().from(schema.spaces).where(where)
        .orderBy(desc(schema.spaces.createdAt), asc(schema.spaces.id))
        .limit(pageSize).offset((page - 1) * pageSize).all();

      const ids = rows.map((r) => r.id);
      const memberCounts = new Map<string, number>();
      const channelCounts = new Map<string, number>();
      if (ids.length > 0) {
        for (const r of db.select({ spaceId: schema.spaceMembers.spaceId, count: sql<number>`count(*)` })
          .from(schema.spaceMembers).where(inArray(schema.spaceMembers.spaceId, ids)).groupBy(schema.spaceMembers.spaceId).all()) {
          memberCounts.set(r.spaceId, r.count);
        }
        for (const r of db.select({ spaceId: schema.channels.spaceId, count: sql<number>`count(*)` })
          .from(schema.channels).where(inArray(schema.channels.spaceId, ids)).groupBy(schema.channels.spaceId).all()) {
          channelCounts.set(r.spaceId, r.count);
        }
      }
      const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
      const owners = new Map<string, UserRow>();
      if (ownerIds.length > 0) {
        for (const u of db.select().from(schema.users).where(inArray(schema.users.id, ownerIds)).all()) owners.set(u.id, u);
      }

      const response: AdminSpaceListResponse = {
        spaces: rows.map((r) => summarize(r, owners.get(r.ownerId), memberCounts.get(r.id) ?? 0, channelCounts.get(r.id) ?? 0)),
        total,
        page,
        pageSize,
      };
      return reply.code(200).send(response);
    },
  );

  // GET /api/admin/spaces/:id — who is in the space and what channels it has
  app.get<{ Params: { id: string } }>('/api/admin/spaces/:id', guard, async (request, reply) => {
    const db = getDb();
    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, request.params.id)).get();
    if (!space) return sendError(reply, 404, 'space_not_found');

    const memberRows = db.select({ member: schema.spaceMembers, user: schema.users })
      .from(schema.spaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.spaceMembers.userId))
      .where(eq(schema.spaceMembers.spaceId, space.id))
      .orderBy(asc(schema.spaceMembers.joinedAt), asc(schema.spaceMembers.userId))
      .all();

    const roleRows = db.select({ userId: schema.memberRoles.userId, id: schema.roles.id, name: schema.roles.name, color: schema.roles.color, position: schema.roles.position })
      .from(schema.memberRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
      .where(eq(schema.memberRoles.spaceId, space.id))
      .orderBy(desc(schema.roles.position))
      .all();
    const rolesByUser = new Map<string, AdminSpaceMember['roles']>();
    for (const r of roleRows) {
      const list = rolesByUser.get(r.userId) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      rolesByUser.set(r.userId, list);
    }

    const members: AdminSpaceMember[] = memberRows.map(({ member, user }) => ({
      ...toPerson(user),
      nickname: member.nickname,
      joinedAt: member.joinedAt,
      isOwner: user.id === space.ownerId,
      roles: rolesByUser.get(user.id) ?? [],
    }));

    const channels: AdminSpaceChannel[] = db.select().from(schema.channels)
      .where(eq(schema.channels.spaceId, space.id))
      .orderBy(asc(schema.channels.position), asc(schema.channels.id))
      .all()
      .map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic, position: c.position ?? 0, categoryId: c.categoryId }));

    const owner = db.select().from(schema.users).where(eq(schema.users.id, space.ownerId)).get();
    const detail: AdminSpaceDetail = {
      space: { ...summarize(space, owner, members.length, channels.length), description: space.description, banner: space.banner },
      members,
      channels,
    };
    request.log.info({ adminId: request.userId, spaceId: space.id }, 'admin viewed a space');
    return reply.code(200).send(detail);
  });

  // GET /api/admin/spaces/:id/channels/:channelId/messages — one page of history, newest first
  app.get<{ Params: { id: string; channelId: string }; Querystring: { before?: string; limit?: string } }>(
    '/api/admin/spaces/:id/channels/:channelId/messages',
    guard,
    async (request, reply) => {
      const db = getDb();
      const channel = db.select().from(schema.channels)
        .where(and(eq(schema.channels.id, request.params.channelId), eq(schema.channels.spaceId, request.params.id)))
        .get();
      if (!channel) return sendError(reply, 404, 'channel_not_found');
      // A voice room keeps no history to read.
      if (channel.type === 'voice') {
        return reply.code(200).send({ messages: [], hasMore: false } satisfies AdminSpaceMessagesResponse);
      }

      const limit = clampInt(request.query.limit, DEFAULT_MESSAGE_LIMIT, 1, MAX_MESSAGE_LIMIT);
      const before = request.query.before;
      if (before !== undefined && !/^\d+$/.test(before)) return sendError(reply, 400, 'validation_failed');

      const idAsNumber = sql<number>`CAST(${schema.messages.id} AS INTEGER)`;
      const where = before
        ? and(eq(schema.messages.channelId, channel.id), lt(idAsNumber, sql`CAST(${before} AS INTEGER)`))
        : eq(schema.messages.channelId, channel.id);
      const rows = db.select({ message: schema.messages, user: schema.users })
        .from(schema.messages)
        .innerJoin(schema.users, eq(schema.users.id, schema.messages.userId))
        .where(where)
        .orderBy(desc(idAsNumber))
        .limit(limit + 1)
        .all();

      const hasMore = rows.length > limit;
      const messages: AdminSpaceMessage[] = rows.slice(0, limit).map(({ message, user }) => ({
        id: message.id,
        type: message.type,
        content: message.content,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        author: toPerson(user),
      }));
      request.log.info({ adminId: request.userId, spaceId: channel.spaceId, channelId: channel.id }, 'admin read a channel');
      return reply.code(200).send({ messages, hasMore } satisfies AdminSpaceMessagesResponse);
    },
  );
}
