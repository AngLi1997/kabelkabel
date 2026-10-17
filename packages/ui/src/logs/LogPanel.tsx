import { LOG_SERVICE, type DrawerViewProps, type LogEntry, type LogExportFormat, type LogLevel } from '@kabel/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { Input, Select } from '../components/form';
import { cx } from '../utils';
import { useLogRecorder } from './LogStatus';
import { sourceTitle } from './logs-plugin';
import { formatTime, LEVEL_LABELS, LEVEL_ORDER } from './recorder';

const LEVEL_OPTIONS = (Object.keys(LEVEL_LABELS) as LogLevel[]).map((level) => ({
  value: level,
  label: level === 'debug' ? '全部（含调试）' : `${LEVEL_LABELS[level]}及以上`,
}));

const FORMAT_OPTIONS: { value: LogExportFormat; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
];

/** 日志看板：按时间顺序列出事件，可按级别、来源、关键字筛选，暂停、清空、下载 */
export function LogPanel({ kernel }: DrawerViewProps) {
  const recorder = useLogRecorder(kernel);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LogLevel | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [format, setFormat] = useState<LogExportFormat | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const all = recorder.list();

  const sources = useMemo(() => {
    const names = new Set(all.map((e) => e.source ?? ''));
    return [...names].map((name) => ({ value: name, label: sourceTitle(kernel, name || undefined) }));
  }, [all, kernel]);

  const entries = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const min = level ? LEVEL_ORDER[level] : LEVEL_ORDER.info;
    return all.filter(
      (e) =>
        LEVEL_ORDER[e.level] >= min &&
        (source === null || (e.source ?? '') === source) &&
        words.every((w) => `${e.type} ${e.label} ${e.message} ${e.source ?? ''}`.toLowerCase().includes(w)),
    );
  }, [all, query, level, source]);

  // 位于底部时跟随新日志滚动
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const filtered = entries.length !== all.length;
  // 有筛选时只下载筛选结果
  const download = () => kernel.services.tryGet(LOG_SERVICE)?.download(format ?? undefined, filtered ? entries : undefined);

  return (
    <div class="kb-logs">
      <div class="kb-logs__filters">
        <Input type="search" class="kb-logs__search" value={query} placeholder="搜索事件、来源、内容" onChange={setQuery} />
        <Select class="kb-logs__select" value={level} placeholder="信息及以上" options={LEVEL_OPTIONS.filter((o) => o.value !== 'info')} onChange={(v) => setLevel(v as LogLevel | null)} />
        <Select class="kb-logs__select" value={source} placeholder="全部来源" options={sources} onChange={(v) => setSource(v as string | null)} />
      </div>
      <div
        ref={list}
        class="kb-logs__list kb-scroll"
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {entries.length === 0 ? (
          <Empty icon="log" text={all.length ? '没有匹配的日志' : '暂无日志'} />
        ) : (
          entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              source={sourceTitle(kernel, entry.source)}
              expanded={expanded === entry.id}
              onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
            />
          ))
        )}
      </div>
      <div class="kb-logs__footer">
        <span class="kb-logs__count">
          {filtered ? `${entries.length} / ${all.length} 条` : `${all.length} 条`}
          {recorder.paused && <span class="kb-logs__paused">已暂停</span>}
        </span>
        <IconButton
          icon={recorder.paused ? 'play' : 'pause'}
          title={recorder.paused ? '继续记录' : '暂停记录'}
          active={recorder.paused}
          onClick={() => recorder.setPaused(!recorder.paused)}
        />
        <IconButton icon="trash" title="清空日志" disabled={!all.length} onClick={() => recorder.clear()} />
        <Select class="kb-logs__format" value={format} placeholder="默认格式" options={FORMAT_OPTIONS} onChange={(v) => setFormat(v as LogExportFormat | null)} />
        <IconButton
          icon="download"
          title={filtered ? '下载筛选结果' : '下载日志'}
          disabled={!entries.length}
          onClick={download}
        />
      </div>
    </div>
  );
}

function LogRow({ entry, source, expanded, onToggle }: { entry: LogEntry; source: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div class={cx('kb-log', `is-${entry.level}`, expanded && 'is-expanded')}>
      <button type="button" class="kb-log__line" aria-expanded={expanded} onClick={onToggle} title={formatTime(entry.time)}>
        <span class="kb-log__time">{formatTime(entry.time, false)}</span>
        <span class="kb-log__level">{LEVEL_LABELS[entry.level]}</span>
        <span class="kb-log__source">{source}</span>
        <span class="kb-log__label">{entry.label}</span>
        <span class="kb-log__message">{entry.message}</span>
      </button>
      {expanded && (
        <div class="kb-log__detail">
          <div>
            {formatTime(entry.time)} · {entry.type}
            {entry.source ? ` · ${entry.source}` : ''}
          </div>
          {entry.payload !== undefined && <pre class="kb-log__payload">{JSON.stringify(entry.payload, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
