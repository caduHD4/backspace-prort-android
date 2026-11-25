import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../../i18n/formatters';
import { describeError } from '../../../i18n/errors';
import { api } from '../../../api/client';
import { Avatar } from '../../ui/Avatar';
import type {
  AdminSpaceChannel,
  AdminSpaceDetail,
  AdminSpaceListResponse,
  AdminSpaceMessage,
  AdminSpacePerson,
  AdminSpaceSummary,
} from '@backspace/shared';

const PAGE_SIZE = 30;

function PersonAvatar({ person, size }: { person: AdminSpacePerson; size: number }) {
  return (
    <Avatar
      src={person.avatar ? api.uploads.url(person.avatar) : null}
      name={person.displayName || person.username}
      size={size}
      avatarColor={person.avatarColor}
    />
  );
}

function SpaceAvatar({ space, size }: { space: AdminSpaceSummary; size: number }) {
  return (
    <Avatar
      src={space.icon ? api.uploads.url(space.icon) : null}
      name={space.name}
      size={size}
      avatarColor={space.avatarColor}
      palette="space"
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">{message}</div>;
}

/** The text channel's history, newest at the bottom, with a button for older pages. */
function ChannelReader({ spaceId, channel }: { spaceId: string; channel: AdminSpaceChannel }) {
  const { t } = useTranslation(['admin']);
  const f = useFormatters();
  const [messages, setMessages] = useState<AdminSpaceMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A reply for a channel the admin has since left must not land on the new one.
  const requestRef = useRef(0);

  const load = useCallback(async (before?: string) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const page = await api.admin.getSpaceMessages(spaceId, channel.id, { before, limit: 50 });
      if (request !== requestRef.current) return;
      setHasMore(page.hasMore);
      // The page arrives newest first; the reader shows oldest first.
      const ordered = [...page.messages].reverse();
      setMessages((previous) => (before ? [...ordered, ...previous] : ordered));
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? describeError(err) : t('admin:spaces.detail.messagesFailed'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [spaceId, channel.id, t]);

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    void load();
    // Counter, not a DOM node: bumping it on the way out is what drops a late reply.
    const counter = requestRef;
    return () => { counter.current++; };
  }, [load]);

  const oldest = messages[0]?.id;

  return (
    <div className="space-y-2">
      <div className="text-xs text-txt-tertiary">
        {channel.topic ? `# ${channel.name} · ${channel.topic}` : `# ${channel.name}`}
      </div>
      {error && <ErrorBanner message={error} />}
      {hasMore && (
        <button
          data-icon-motion="press"
          disabled={loading}
          onClick={() => void load(oldest)}
          className="text-xs text-accent-primary hover:text-accent-primary/80 disabled:opacity-50"
        >
          {t('admin:spaces.detail.loadOlder')}
        </button>
      )}
      {loading && messages.length === 0 && (
        <div className="text-sm text-txt-tertiary py-2">{t('admin:spaces.detail.loadingMessages')}</div>
      )}
      {!loading && !error && messages.length === 0 && (
        <div className="text-sm text-txt-tertiary py-2">{t('admin:spaces.detail.noMessages')}</div>
      )}
      <div className="space-y-2 max-h-[420px] overflow-y-auto rounded-lg bg-wash/[0.02] p-3">
        {messages.map((message) => (
          <div key={message.id} className="flex items-start gap-2.5">
            {message.author ? <PersonAvatar person={message.author} size={28} /> : <div className="w-7 h-7" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-txt-primary truncate">
                  {message.author ? message.author.displayName || message.author.username : ''}
                </span>
                <span className="text-ui-micro text-txt-tertiary">{f.formatDateTime(message.createdAt)}</span>
                {message.editedAt !== null && (
                  <span className="text-ui-micro text-txt-tertiary">{t('admin:spaces.detail.edited')}</span>
                )}
                {message.type === 'system' && (
                  <span className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-accent-sky/20 text-accent-sky">
                    {t('admin:spaces.detail.system')}
                  </span>
                )}
              </div>
              <div className="text-sm text-txt-secondary whitespace-pre-wrap break-words">{message.content}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpaceDetail({ spaceId, onBack }: { spaceId: string; onBack: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const f = useFormatters();
  const [detail, setDetail] = useState<AdminSpaceDetail | null>(null);
  const [error, setError] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError('');
    setChannelId(null);
    api.admin.getSpace(spaceId)
      .then((result) => { if (!cancelled) setDetail(result); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? describeError(err) : t('admin:spaces.detail.loadFailed'));
      });
    return () => { cancelled = true; };
  }, [spaceId, t]);

  const channel = detail?.channels.find((c) => c.id === channelId) ?? null;

  return (
    <div className="space-y-4">
      <button
        data-icon-motion="press"
        onClick={onBack}
        className="text-xs text-accent-primary hover:text-accent-primary/80"
      >
        ← {t('admin:spaces.detail.back')}
      </button>

      {error && <ErrorBanner message={error} />}
      {!detail && !error && <div className="text-sm text-txt-tertiary py-4">{t('admin:spaces.loading')}</div>}

      {detail && (
        <>
          <div className="flex items-center gap-3 rounded-lg bg-wash/[0.02] p-3.5">
            <SpaceAvatar space={detail.space} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-txt-primary truncate">{detail.space.name}</div>
              <div className="text-xs text-txt-tertiary truncate">
                {detail.space.owner
                  ? t('admin:spaces.owner', { name: detail.space.owner.displayName || detail.space.owner.username })
                  : t('admin:spaces.ownerUnknown')}
                {' · '}
                {t('admin:spaces.created', { date: f.formatMediumDate(detail.space.createdAt) })}
              </div>
              {detail.space.description && (
                <div className="text-xs text-txt-secondary mt-1 whitespace-pre-wrap break-words">{detail.space.description}</div>
              )}
            </div>
          </div>
          <div className="text-xs text-txt-tertiary">{t('admin:spaces.detail.readOnly')}</div>

          <section className="space-y-1.5">
            <h4 className="text-sm font-semibold text-txt-primary">{t('admin:spaces.detail.channels')}</h4>
            {detail.channels.length === 0 && (
              <div className="text-sm text-txt-tertiary">{t('admin:spaces.detail.noChannels')}</div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {detail.channels.map((c) => (
                <button
                  key={c.id}
                  data-icon-motion="press"
                  disabled={c.type === 'voice'}
                  title={c.type === 'voice' ? t('admin:spaces.detail.voiceChannel') : undefined}
                  onClick={() => setChannelId(c.id)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    c.id === channelId
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'bg-wash/[0.04] text-txt-secondary hover:bg-wash/[0.08]'
                  }`}
                >
                  {c.type === 'voice' ? '🔊 ' : '# '}{c.name}
                </button>
              ))}
            </div>
            {channel ? (
              <ChannelReader spaceId={detail.space.id} channel={channel} />
            ) : (
              detail.channels.some((c) => c.type !== 'voice') && (
                <div className="text-xs text-txt-tertiary">{t('admin:spaces.detail.selectChannel')}</div>
              )
            )}
          </section>

          <section className="space-y-1.5">
            <h4 className="text-sm font-semibold text-txt-primary">
              {t('admin:spaces.detail.members')} ({detail.members.length})
            </h4>
            {detail.members.length === 0 && (
              <div className="text-sm text-txt-tertiary">{t('admin:spaces.detail.noMembers')}</div>
            )}
            {detail.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 rounded-lg bg-wash/[0.02] p-2.5">
                <div className={member.isDeleted ? 'opacity-50' : ''}><PersonAvatar person={member} size={28} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium text-txt-primary truncate ${member.isDeleted ? 'line-through' : ''}`}>
                      {member.nickname || member.displayName || member.username}
                    </span>
                    {member.nickname && <span className="text-xs text-txt-tertiary truncate">{member.username}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {member.isOwner && (
                      <span className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-accent-amber/20 text-accent-amber">
                        {t('admin:spaces.detail.ownerBadge')}
                      </span>
                    )}
                    {member.homeInstance && (
                      <span className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-accent-sky/20 text-accent-sky truncate max-w-[120px]">
                        {member.homeInstance}
                      </span>
                    )}
                    {member.isDeleted && (
                      <span className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-accent-rose/20 text-accent-rose">
                        {t('admin:users.badge.deleted')}
                      </span>
                    )}
                    {member.roles.map((role) => (
                      <span
                        key={role.id}
                        className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-wash/[0.06] text-txt-secondary"
                        style={role.color ? { color: role.color } : undefined}
                      >
                        {role.name}
                      </span>
                    ))}
                    <span className="text-ui-micro text-txt-tertiary">
                      {t('admin:spaces.detail.joined', { date: f.formatMediumDate(member.joinedAt) })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export function SpacesPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const f = useFormatters();
  const [data, setData] = useState<AdminSpaceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestRef = useRef(0);

  const fetchSpaces = useCallback(async (q: string, p: number) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.listSpaces({ q: q || undefined, page: p, pageSize: PAGE_SIZE });
      if (request === requestRef.current) setData(result);
    } catch (err) {
      if (request === requestRef.current) {
        setError(err instanceof Error ? describeError(err) : t('admin:spaces.loadFailed'));
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => { void fetchSpaces(query, page); }, [fetchSpaces, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      void fetchSpaces(value, 1);
    }, 300);
  };

  if (openId) return <SpaceDetail spaceId={openId} onBack={() => setOpenId(null)} />;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-txt-primary">{t('admin:spaces.title')}</h3>
        <p className="text-sm text-txt-tertiary mt-1">{t('admin:spaces.description')}</p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder={t('admin:spaces.searchPlaceholder')}
        aria-label={t('admin:spaces.searchPlaceholder')}
        className="input-search w-full"
      />

      {error && <ErrorBanner message={error} />}
      {loading && !data && <div className="text-sm text-txt-tertiary py-4">{t('admin:spaces.loading')}</div>}

      {data && (
        <div className="space-y-1.5">
          {data.spaces.length === 0 && (
            <div className="text-sm text-txt-tertiary py-4 text-center">{t('admin:spaces.empty')}</div>
          )}
          {data.spaces.map((space) => (
            <button
              key={space.id}
              data-icon-motion="press"
              onClick={() => setOpenId(space.id)}
              className="w-full flex items-center gap-3 rounded-lg bg-wash/[0.02] hover:bg-wash/[0.05] p-3.5 text-left transition-colors"
            >
              <SpaceAvatar space={space} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-txt-primary truncate">{space.name}</span>
                  <span className="px-1.5 py-0.5 text-ui-micro font-medium rounded bg-wash/[0.06] text-txt-secondary">
                    {t(`admin:spaces.visibility.${space.visibility}`, { defaultValue: space.visibility })}
                  </span>
                </div>
                <div className="text-xs text-txt-tertiary truncate mt-0.5">
                  {space.owner
                    ? t('admin:spaces.owner', { name: space.owner.displayName || space.owner.username })
                    : t('admin:spaces.ownerUnknown')}
                  {' · '}
                  {t('admin:spaces.stats', { members: space.memberCount, channels: space.channelCount })}
                  {' · '}
                  {f.formatMediumDate(space.createdAt)}
                </div>
              </div>
              <svg className="w-4 h-4 text-txt-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-txt-secondary">
          <button
            data-icon-motion="press"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded hover:bg-wash/[0.05] disabled:opacity-40"
          >
            {t('admin:spaces.previous')}
          </button>
          <span>{t('admin:spaces.pagination', { page, total: totalPages })}</span>
          <button
            data-icon-motion="press"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded hover:bg-wash/[0.05] disabled:opacity-40"
          >
            {t('admin:spaces.next')}
          </button>
        </div>
      )}
    </div>
  );
}
