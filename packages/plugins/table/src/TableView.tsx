import { isReadonly, NOTIFY_SERVICE, type Kernel } from '@kabel/core';
import { Button, Empty, IconButton, useSelector } from '@kabel/ui';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { TABLE_SERVICE, type TableColumn, type TableConfig, type TableRow } from './contract';
import { parseCellValue, type ChangeTracker } from './edit';
import { cellText, getField, pageCount, pageItems } from './source';

export interface TableViewProps {
  kernel: Kernel;
  config: TableConfig;
  pageSizes: number[];
  /** 修改追踪（可编辑表格用于标记新增行与修改过的单元格） */
  tracker?: () => ChangeTracker | undefined;
}

const widthOf = (w: TableColumn['width']) => (typeof w === 'number' ? `${w}px` : w);
const marked = (column: TableColumn, row: TableRow) =>
  typeof column.mark === 'function' ? column.mark(row) : typeof column.mark === 'string' ? !!getField(row, column.mark) : false;
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ') || undefined;

/**
 * 表格面板：表头固定、行可选中，底部为分页条（共 N 条 · 每页条数 · 页码）。
 * 可编辑时顶部为操作条（新增行 / 删除 / 放弃修改 / 提交），双击单元格行内编辑；可多选时首列为复选框。
 */
export function TableView({ kernel, config, pageSizes, tracker }: TableViewProps) {
  const table = useSelector((s) => s.table?.[config.id]);
  const readonly = useSelector((s) => isReadonly(s));
  if (!table) return null;
  const service = kernel.services.get(TABLE_SERVICE);
  const id = config.id;
  const editable = !readonly && service.isEditable(id);
  const multiple = service.isMultiple(id);
  const mode = config.pagination === undefined ? 'client' : config.pagination;
  const paged = mode !== false;
  const pages = pageCount(table.total, table.pageSize);
  const page = Math.min(table.page, pages);
  const offset = paged ? (page - 1) * table.pageSize : 0;
  // 前端分页从全量数据截取；后端分页的 rows 即当前页
  const start = mode === 'client' ? offset : 0;
  const rows = mode === 'client' ? table.rows.slice(start, start + table.pageSize) : table.rows;
  const indexTitle = config.index === false ? null : typeof config.index === 'string' ? config.index : '序号';
  const changes = editable ? tracker?.() : undefined;
  const editableColumns = config.columns.filter((c) => c.editable !== false);
  const invalid = new Set(table.invalid.map((c) => `${c.index}:${c.key}`));
  const checked = new Set(table.checked);
  const visible = rows.map((_, i) => start + i);
  const visibleChecked = visible.filter((i) => checked.has(i)).length;
  const fail = (error: unknown) => kernel.bus.emit('error', { error, source: `kabel:table:${id}` });

  const go = async (p: number, size?: number) => {
    // 后端分页翻页会重新请求，丢弃当前页未提交的修改
    if (mode === 'server' && table.dirty) {
      const ok = await kernel.services.tryGet(NOTIFY_SERVICE)?.confirm({ message: '当前页有未提交的修改，翻页将丢弃这些修改。', okText: '翻页', danger: true });
      if (ok === false) return;
    }
    await service.setPage(id, p, size).catch(() => {});
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' && editable && editableColumns[0]) {
      event.preventDefault();
      service.select(id, index);
      service.edit(id, { index, key: editableColumns[0].key });
      return;
    }
    if (event.key === ' ' && multiple) {
      event.preventDefault();
      service.toggleCheck(id, index);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    service.select(id, table.selected === index ? null : index);
  };

  /** 写入单元格后结束编辑；Tab 移到同一行的下一个 / 上一个可编辑列 */
  const commit = (index: number, column: TableColumn, value: unknown, move?: 1 | -1) => {
    try {
      service.updateCell(id, index, column.key, value);
    } catch (error) {
      fail(error);
    }
    const next = move ? editableColumns[editableColumns.indexOf(column) + move] : undefined;
    service.edit(id, next ? { index, key: next.key } : null);
  };

  const removable = table.checked.length > 0 || table.selected !== null;

  return (
    <div class={cx('kb-dt', editable && 'is-editable')} aria-busy={table.loading}>
      {editable && (
        <div class="kb-dt__bar" role="toolbar" aria-label="表格编辑">
          <Button size="sm" icon="plus" disabled={table.submitting} onClick={() => service.addRow(id)}>
            新增行
          </Button>
          <Button size="sm" icon="trash" disabled={!removable || table.submitting} onClick={() => service.removeRows(id)}>
            {table.checked.length ? `删除（${table.checked.length}）` : '删除'}
          </Button>
          <span class="kb-dt__spacer" />
          <Button size="sm" icon="undo" disabled={!table.dirty || table.submitting} onClick={() => service.revert(id)}>
            放弃修改
          </Button>
          <Button size="sm" variant="primary" icon="submit" disabled={!table.dirty || table.submitting} onClick={() => void service.submit(id)}>
            {table.submitting ? '提交中…' : '提交'}
          </Button>
        </div>
      )}
      <div class="kb-dt__scroll kb-scroll">
        <table class="kb-dt__table">
          <colgroup>
            {multiple && <col style={{ width: '36px' }} />}
            {indexTitle !== null && <col style={{ width: '52px' }} />}
            {config.columns.map((c) => (
              <col key={c.key} style={c.width !== undefined ? { width: widthOf(c.width) } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {multiple && (
                <th class="is-center kb-dt__check">
                  <CheckAll
                    checked={visible.length > 0 && visibleChecked === visible.length}
                    indeterminate={visibleChecked > 0 && visibleChecked < visible.length}
                    disabled={!visible.length}
                    onChange={(value) => service.checkAll(id, value, visible)}
                  />
                </th>
              )}
              {indexTitle !== null && <th class="is-center">{indexTitle}</th>}
              {config.columns.map((c) => (
                <th key={c.key} class={c.align ? `is-${c.align}` : undefined}>
                  {editable && c.required && <span class="kb-dt__required" aria-hidden="true">*</span>}
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const index = start + i;
              const selected = table.selected === index;
              const added = changes?.originalOf(row) === null;
              return (
                <tr
                  key={index}
                  class={cx(selected && 'is-selected', checked.has(index) && 'is-checked', added && 'is-added')}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => service.select(id, selected && !editable ? null : index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  {multiple && (
                    <td class="is-center kb-dt__check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`勾选第 ${offset + i + 1} 行`}
                        checked={checked.has(index)}
                        onChange={() => service.toggleCheck(id, index)}
                      />
                    </td>
                  )}
                  {indexTitle !== null && <td class="is-center">{offset + i + 1}</td>}
                  {config.columns.map((c) => {
                    const value = getField(row, c.key);
                    const editing = editable && table.editing?.index === index && table.editing.key === c.key;
                    const canEdit = editable && c.editable !== false;
                    const text = c.format ? c.format(value, row, index) : cellText(value);
                    const ellipsis = c.ellipsis !== false;
                    return (
                      <td
                        key={c.key}
                        class={cx(
                          c.align && `is-${c.align}`,
                          ellipsis && 'is-ellipsis',
                          canEdit && 'is-editable',
                          editing && 'is-editing',
                          !added && changes?.isCellChanged(row, c.key) && 'is-changed',
                          invalid.has(`${index}:${c.key}`) && 'is-invalid',
                        )}
                        title={ellipsis && !editing ? text : undefined}
                        onDblClick={canEdit ? () => service.edit(id, { index, key: c.key }) : undefined}
                      >
                        {editing ? (
                          <CellEditor
                            column={c}
                            value={value}
                            onCommit={(next, move) => commit(index, c, next, move)}
                            onCancel={() => service.edit(id, null)}
                          />
                        ) : (
                          <span class="kb-dt__cell">
                            <span class="kb-dt__text">{text}</span>
                            {marked(c, row) && <span class="kb-dt__mark" aria-label="重点">★</span>}
                          </span>
                        )}
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
        <span class="kb-dt__total">
          共 {table.total} 条{multiple && table.checked.length > 0 && `，已选 ${table.checked.length} 条`}
        </span>
        {paged && (
          <div class="kb-dt__pager">
            <select
              class="kb-dt__size"
              aria-label="每页条数"
              value={table.pageSize}
              onChange={(e) => void go(1, Number(e.currentTarget.value))}
            >
              {(pageSizes.includes(table.pageSize) ? pageSizes : [table.pageSize, ...pageSizes]).map((n) => (
                <option key={n} value={n}>
                  {n} 条/页
                </option>
              ))}
            </select>
            <IconButton icon="chevron-left" title="上一页" disabled={page <= 1 || table.loading} onClick={() => void go(page - 1)} />
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
                  onClick={() => p !== page && void go(p)}
                >
                  {p}
                </button>
              ),
            )}
            <IconButton icon="chevron-right" title="下一页" disabled={page >= pages || table.loading} onClick={() => void go(page + 1)} />
          </div>
        )}
      </footer>
    </div>
  );
}

/** 表头的全选复选框（当前页），部分勾选时为半选状态 */
function CheckAll({ checked, indeterminate, disabled, onChange }: { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="勾选本页全部行"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}

const optionsOf = (column: TableColumn) =>
  (column.options ?? []).map((o) => (typeof o === 'object' ? { label: o.label, value: String(o.value) } : { label: String(o), value: String(o) }));

/** 行内编辑器：Enter / 失焦写入，Esc 取消，Tab / Shift+Tab 写入并移到下一 / 上一可编辑列 */
function CellEditor({
  column,
  value,
  onCommit,
  onCancel,
}: {
  column: TableColumn;
  value: unknown;
  onCommit: (value: unknown, move?: 1 | -1) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current instanceof HTMLInputElement) ref.current.select();
  }, []);
  const finish = (raw: string, move?: 1 | -1) => {
    if (done.current) return;
    done.current = true;
    onCommit(parseCellValue(column, raw), move);
  };
  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      done.current = true;
      onCancel();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      finish(event.currentTarget.value, event.shiftKey ? -1 : 1);
    }
  };
  const common = {
    ref,
    class: 'kb-dt__editor',
    'aria-label': column.title,
    onKeyDown,
    onClick: (e: Event) => e.stopPropagation(),
    onDblClick: (e: Event) => e.stopPropagation(),
    onBlur: (e: JSX.TargetedFocusEvent<HTMLInputElement | HTMLSelectElement>) => finish(e.currentTarget.value),
  };
  const initial = value === null || value === undefined ? '' : String(value);
  if (column.type === 'select') {
    return (
      <select {...common} value={initial} onChange={(e) => finish(e.currentTarget.value)}>
        <option value="">请选择</option>
        {optionsOf(column).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return <input {...common} type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} defaultValue={initial} />;
}
