import type { Kernel } from '@kabel/core';
import { Empty, IconButton, useSelector } from '@kabel/ui';
import type { JSX } from 'preact';
import { DATA_TABLE_SERVICE, type DataTableColumn, type DataTableConfig, type DataTableRow } from './contract';
import { cellText, getField, pageCount, pageItems } from './source';

export interface DataTableProps {
  kernel: Kernel;
  config: DataTableConfig;
  pageSizes: number[];
}

const widthOf = (w: DataTableColumn['width']) => (typeof w === 'number' ? `${w}px` : w);
const marked = (column: DataTableColumn, row: DataTableRow) =>
  typeof column.mark === 'function' ? column.mark(row) : typeof column.mark === 'string' ? !!getField(row, column.mark) : false;

/** 表格面板：表头固定、行可选中，底部为分页条（共 N 条 · 每页条数 · 页码） */
export function DataTable({ kernel, config, pageSizes }: DataTableProps) {
  const table = useSelector((s) => s.dataTable?.[config.id]);
  if (!table) return null;
  const service = kernel.services.get(DATA_TABLE_SERVICE);
  const mode = config.pagination === undefined ? 'client' : config.pagination;
  const paged = mode !== false;
  const pages = pageCount(table.total, table.pageSize);
  const page = Math.min(table.page, pages);
  const offset = paged ? (page - 1) * table.pageSize : 0;
  // 前端分页从全量数据截取；后端分页的 rows 即当前页
  const start = mode === 'client' ? offset : 0;
  const rows = mode === 'client' ? table.rows.slice(start, start + table.pageSize) : table.rows;
  const indexTitle = config.index === false ? null : typeof config.index === 'string' ? config.index : '序号';
  const go = (p: number, size?: number) => void service.setPage(config.id, p, size).catch(() => {});

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    service.select(config.id, table.selected === index ? null : index);
  };

  return (
    <div class="kb-dt" aria-busy={table.loading}>
      <div class="kb-dt__scroll kb-scroll">
        <table class="kb-dt__table">
          <colgroup>
            {indexTitle !== null && <col style={{ width: '52px' }} />}
            {config.columns.map((c) => (
              <col key={c.key} style={c.width !== undefined ? { width: widthOf(c.width) } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {indexTitle !== null && <th class="is-center">{indexTitle}</th>}
              {config.columns.map((c) => (
                <th key={c.key} class={c.align ? `is-${c.align}` : undefined}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const index = start + i;
              const selected = table.selected === index;
              return (
                <tr
                  key={index}
                  class={selected ? 'is-selected' : undefined}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => service.select(config.id, selected ? null : index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  {indexTitle !== null && <td class="is-center">{offset + i + 1}</td>}
                  {config.columns.map((c) => {
                    const value = getField(row, c.key);
                    const text = c.format ? c.format(value, row, index) : cellText(value);
                    const ellipsis = c.ellipsis !== false;
                    return (
                      <td key={c.key} class={[c.align && `is-${c.align}`, ellipsis && 'is-ellipsis'].filter(Boolean).join(' ') || undefined} title={ellipsis ? text : undefined}>
                        <span class="kb-dt__cell">
                          <span class="kb-dt__text">{text}</span>
                          {marked(c, row) && <span class="kb-dt__mark" aria-label="重点">★</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && !table.loading && <Empty text={table.error ? `加载失败：${table.error}` : config.emptyText ?? '暂无数据'} />}
        {table.loading && <div class="kb-dt__loading">加载中…</div>}
      </div>
      <footer class="kb-dt__footer">
        <span class="kb-dt__total">共 {table.total} 条</span>
        {paged && (
          <div class="kb-dt__pager">
            <select
              class="kb-dt__size"
              aria-label="每页条数"
              value={table.pageSize}
              onChange={(e) => go(1, Number(e.currentTarget.value))}
            >
              {(pageSizes.includes(table.pageSize) ? pageSizes : [table.pageSize, ...pageSizes]).map((n) => (
                <option key={n} value={n}>
                  {n} 条/页
                </option>
              ))}
            </select>
            <IconButton icon="chevron-left" title="上一页" disabled={page <= 1 || table.loading} onClick={() => go(page - 1)} />
            {pageItems(page, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} class="kb-dt__gap">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  class={p === page ? 'kb-dt__page is-active' : 'kb-dt__page'}
                  aria-current={p === page ? 'page' : undefined}
                  disabled={table.loading}
                  onClick={() => p !== page && go(p)}
                >
                  {p}
                </button>
              ),
            )}
            <IconButton icon="chevron-right" title="下一页" disabled={page >= pages || table.loading} onClick={() => go(page + 1)} />
          </div>
        )}
      </footer>
    </div>
  );
}
