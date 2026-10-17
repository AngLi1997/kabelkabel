import type { Kernel } from '@kabel/core';
import {
  FieldExtensions,
  type FieldDefinition,
  type FieldGroup,
  type FieldRaw,
  type FieldsService,
  type FieldValue,
} from '@kabel/plugin-fields';
import {
  Button,
  CheckboxGroup,
  cx,
  Empty,
  IconButton,
  Input,
  NumberInput,
  RadioGroup,
  Section,
  Select,
  Textarea,
  useContributions,
  useReadonly,
  useSelector,
} from '@kabel/ui';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { catalogActions } from './slice';

export interface CatalogPanelProps {
  kernel: Kernel;
  fields: FieldsService;
  columns: number;
}

/** 档案详情数据：按字段分组渲染，分组可折叠，“更多字段”按需展开 */
export function CatalogPanel({ kernel, fields, columns }: CatalogPanelProps) {
  const groups = useSelector((s) => s.fieldsView?.groups ?? []);
  const focus = useSelector((s) => s.fieldsView?.focus ?? null);
  const ui = useSelector((s) => s.catalog);
  const root = useRef<HTMLDivElement>(null);

  // 焦点由服务驱动（下一个字段、框选识别、版面分析定位…）：展开所在分组并把 DOM 焦点移过去
  useEffect(() => {
    if (!focus) return;
    const group = groups.find((g) => g.fields.some((f) => f.key === focus));
    const def = group?.fields.find((f) => f.key === focus);
    if (group) kernel.dispatch(catalogActions.expand({ group: group.key, more: def?.more }));
    requestAnimationFrame(() => {
      const cell = root.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(focus)}"]`);
      if (!cell) return;
      cell.scrollIntoView?.({ block: 'nearest' });
      if (!cell.contains(cell.ownerDocument.activeElement)) cell.querySelector<HTMLElement>('input, textarea, select')?.focus();
    });
  }, [focus]);

  if (!groups.length) return <Empty icon="list" text="未配置字段，请在 设置 › 插件管理 › 字段模型 中添加" />;

  return (
    <div ref={root} class="kb-catalog kb-scroll" style={{ '--kb-catalog-columns': columns }}>
      {groups.map((group) => (
        <GroupView key={group.key} group={group} fields={fields} kernel={kernel} collapsed={!!ui?.collapsed[group.key]} more={!!ui?.more[group.key]} />
      ))}
    </div>
  );
}

interface GroupViewProps {
  kernel: Kernel;
  fields: FieldsService;
  group: FieldGroup;
  collapsed: boolean;
  more: boolean;
}

function GroupView({ kernel, fields, group, collapsed, more }: GroupViewProps) {
  const hasMore = group.fields.some((f) => f.more);
  const visible = group.fields.filter((f) => more || !f.more);
  return (
    <Section title={group.title} collapsed={collapsed} onToggle={() => kernel.dispatch(catalogActions.toggle(group.key))} class="kb-catalog__group">
      <div class="kb-catalog__grid">
        {visible.map((field) => (
          <FieldCell key={field.key} field={field} fields={fields} kernel={kernel} />
        ))}
      </div>
      {hasMore && (
        <Button size="sm" variant="text" icon={more ? 'chevron-up' : 'chevron-down'} class="kb-catalog__more" onClick={() => kernel.dispatch(catalogActions.toggleMore(group.key))}>
          {more ? '收起更多字段' : '更多字段'}
        </Button>
      )}
    </Section>
  );
}

interface FieldCellProps {
  kernel: Kernel;
  fields: FieldsService;
  field: FieldDefinition;
}

const SOURCE_LABEL: Record<string, string> = { ocr: '识别填入', ai: 'AI 已填入' };

function FieldCell({ kernel, fields, field }: FieldCellProps) {
  const entry = useSelector((s) => s.fields?.values[field.key]) as FieldValue | undefined;
  const error = useSelector((s) => s.fieldsView?.errors[field.key]);
  const focused = useSelector((s) => s.fieldsView?.focus === field.key);
  const readonly = useReadonly();
  const actions = useContributions(FieldExtensions.actions).filter((a) => !a.when || a.when(field, kernel));
  const id = `kb-field-${kernel.id}-${field.key}`;
  const set = (value: unknown) => fields.set(field.key, value, { source: 'user' });
  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    // 单行控件中 Enter 跳到下一个字段，Shift+Enter 上一个（输入法组合中不处理）
    if (event.key !== 'Enter' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement).tagName === 'TEXTAREA') return;
    event.preventDefault();
    if (event.shiftKey) fields.prev();
    else fields.next();
  };
  const pending = entry?.review === 'pending';
  const sourceLabel = entry && SOURCE_LABEL[entry.source];

  return (
    <div
      class={cx('kb-catalog__field', field.wide && 'is-wide', focused && 'is-focused', pending && 'is-pending', error && 'is-invalid')}
      data-field={field.key}
      onFocusIn={() => fields.focus(field.key)}
      onKeyDown={onKeyDown}
    >
      <div class="kb-catalog__label">
        <label for={id} class={cx(field.required && 'is-required')} title={field.hint}>
          {field.label}
        </label>
        {!readonly &&
          actions.map((action) => (
            <IconButton key={action.id} icon={action.icon} title={action.title} onClick={() => void kernel.execute(action.command, field.key)} />
          ))}
      </div>
      <div class="kb-catalog__control">
        <Control id={id} field={field} value={entry?.value ?? null} onChange={set} readonly={readonly} invalid={!!error} />
      </div>
      {(sourceLabel || error) && (
        <div class="kb-catalog__meta">
          {error && <span class="kb-catalog__error">{error}</span>}
          {sourceLabel && (
            <span class={cx('kb-catalog__source', pending && 'is-pending')} title={entry?.evidence?.text}>
              {sourceLabel}
              {pending ? ' · 待复核' : entry?.review === 'confirmed' ? ' · 已确认' : ''}
            </span>
          )}
          {pending && !readonly && (
            <button type="button" class="kb-catalog__link" onClick={() => fields.confirm(field.key)}>
              确认
            </button>
          )}
          {entry?.evidence && (
            <button type="button" class="kb-catalog__link" onClick={() => void kernel.execute('workspace.reveal', entry.evidence!.documentId, entry.evidence!.bbox)}>
              定位
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ControlProps {
  id: string;
  field: FieldDefinition;
  value: FieldRaw;
  onChange: (value: unknown) => void;
  readonly: boolean;
  invalid: boolean;
}

function Control({ id, field, value, onChange, readonly, invalid }: ControlProps) {
  const options = (field.options ?? []).map((o) => ({ label: o, value: o }));
  const common = { id, readOnly: readonly, invalid, placeholder: field.placeholder };
  switch (field.type) {
    case 'textarea':
      return <Textarea {...common} value={(value as string) ?? ''} onChange={onChange} rows={2} />;
    case 'number':
      return <NumberInput {...common} value={typeof value === 'number' ? value : null} onChange={onChange} />;
    case 'select':
      return <Select {...common} value={(value as string) ?? null} options={options} onChange={onChange} />;
    case 'radio':
      return <RadioGroup {...common} name={id} value={(value as string) ?? null} options={options} onChange={onChange} />;
    case 'checkbox':
      return <CheckboxGroup {...common} value={Array.isArray(value) ? value : []} options={options} onChange={onChange} />;
    case 'date':
      return <Input {...common} value={(value as string) ?? ''} onChange={onChange} placeholder={field.placeholder ?? 'YYYY-MM-DD'} />;
    default:
      return <Input {...common} value={value == null ? '' : String(value)} onChange={onChange} />;
  }
}
