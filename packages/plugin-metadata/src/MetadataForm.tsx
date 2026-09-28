import type { PanelAction, PanelViewProps } from '@kabel/core';
import { cx, Empty, PanelActions, Section, useContributions, useElementSize, useKernel, useSelector, ViewHost } from '@kabel/ui';
import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import { builtinFieldTypes, FieldTypes } from './field-types';
import { metadataActions, recordActions } from './slices';
import type { NormalizedField } from './types';

/** 单个字段最小宽度（标签 + 控件），用于按容器宽度自动计算列数 */
const MIN_FIELD_WIDTH = 300;

export const fieldDomId = (instanceId: string, key: string) => `kb-${instanceId}-field-${key}`;

export interface MetadataFormProps extends PanelViewProps {
  /** 面板顶部右侧的操作按钮 */
  actions?: readonly PanelAction[];
}

export function MetadataForm({ actions }: MetadataFormProps) {
  const schema = useSelector((s) => s.metadata.schema);
  const root = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(root);
  const fitColumns = width ? Math.max(1, Math.floor((width - 24) / MIN_FIELD_WIDTH)) : schema.columns;

  return (
    <div class="kb-md-panel">
      {!!actions?.length && (
        <div class="kb-md__bar">
          <span class="kb-md__bar-title">{schema.title}</span>
          <PanelActions actions={actions} />
        </div>
      )}
      {schema.groups.length ? <Groups root={root} fitColumns={fitColumns} /> : <Empty icon="file" text="未配置著录项" />}
    </div>
  );
}

function Groups({ root, fitColumns }: { root: RefObject<HTMLDivElement>; fitColumns: number }) {
  const kernel = useKernel();
  const schema = useSelector((s) => s.metadata.schema);
  const collapsed = useSelector((s) => s.metadata.collapsed);
  return (
    <div ref={root} class="kb-md kb-scroll" style={{ '--kb-label-width': `${schema.labelWidth}px` }}>
      {schema.groups.map((group) => {
        const columns = Math.max(1, Math.min(group.columns, fitColumns));
        return (
          <Section
            key={group.key}
            id={`kb-${kernel.id}-group-${group.key}`}
            title={group.title}
            collapsed={collapsed[group.key]}
            onToggle={() => kernel.dispatch(metadataActions.toggleGroup(group.key))}
          >
            <div class="kb-md__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {group.fields.map((field) => (field.hidden ? null : <FieldRow key={field.key} field={field} columns={columns} />))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function FieldRow({ field, columns }: { field: NormalizedField; columns: number }) {
  const kernel = useKernel();
  const value = useSelector((s) => s.record.values[field.key]);
  const error = useSelector((s) => s.metadata.errors[field.key]);
  const readonly = useSelector((s) => s.metadata.readonly);
  const types = useContributions(FieldTypes);
  const type = types.find((t) => t.id === field.type) ?? builtinFieldTypes[0]!;
  const id = fieldDomId(kernel.id, field.key);
  const span = field.span === 'full' ? columns : Math.min(field.span, columns);
  const wide = field.type === 'textarea' || field.type === 'checkbox';

  return (
    <div
      class={cx('kb-md__field', error && 'is-invalid', field.required && 'is-required', wide && 'is-top')}
      style={{ gridColumn: `span ${span}` }}
      data-field={field.key}
    >
      <label class="kb-md__label" for={id} title={field.label}>
        {field.label}
      </label>
      <div class="kb-md__control">
        <ViewHost
          view={type.view}
          props={{
            id,
            field,
            value,
            disabled: readonly,
            invalid: !!error,
            kernel,
            onChange: (next: unknown) =>
              kernel.dispatch(
                recordActions.setField(
                  { key: field.key, value: next },
                  { history: { label: `修改「${field.label}」`, coalesce: `field:${field.key}` } },
                ),
              ),
            onFocus: () => kernel.bus.emit('field:focus', { key: field.key }),
            onBlur: () => kernel.dispatch(metadataActions.touch(field.key)),
          }}
        />
        {error && <div class="kb-md__error">{error}</div>}
      </div>
    </div>
  );
}
