import type { Schema } from '@kabel/core';
import { useState } from 'preact/hooks';
import { cx } from '../utils';
import { Button, IconButton } from './Button';
import { CheckboxGroup, Input, NumberInput, Select, Switch, Textarea, type OptionItem } from './form';

/**
 * 由 schemastery Schema 生成的配置表单（插件 `Config` 的编辑界面）。
 *
 * | Schema | 控件 |
 * | --- | --- |
 * | `string` | 输入框；`role('textarea')` 多行，`role('secret')` 密码 |
 * | `number` / `natural` / `percent` | 数字输入 |
 * | `boolean` | 开关 |
 * | `union` 全部为 `const` | 下拉选择（`description` 为选项文字） |
 * | `array(union(const…))` | 多选 |
 * | `array(string \| number)` | 可增删的列表 |
 * | `array(object)` | 可增删、排序的分组卡片；`role('table')` 时为表格（适合字段清单） |
 * | `object` | 字段列表，嵌套对象显示为分组 |
 * | 其他 | JSON 文本 |
 */
export interface SchemaFormProps {
  schema: Schema;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function SchemaForm({ schema, value, onChange, disabled }: SchemaFormProps) {
  return (
    <div class="kb-schema">
      <SchemaNode schema={schema} value={value} onChange={onChange} disabled={disabled} path="" />
    </div>
  );
}

interface NodeProps {
  schema: Schema;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  path: string;
}

const describe = (schema: Schema, fallback: string) => {
  const d = schema.meta?.description;
  return (typeof d === 'string' ? d : d?.['zh-CN'] ?? d?.['']) || fallback;
};

const isConst = (s: Schema) => s.type === 'const';
const isConstUnion = (s: Schema) => s.type === 'union' && !!s.list?.length && s.list.every(isConst);
const isScalar = (s: Schema) =>
  ['string', 'number', 'natural', 'percent', 'boolean'].includes(s.type) || isConstUnion(s);

const optionsOf = (s: Schema): OptionItem[] =>
  (s.list ?? []).map((item) => ({ value: item.value as string | number, label: describe(item, String(item.value)) }));

/** 新增数组项的初始值：取 Schema 默认值并补全 */
function initialOf(schema: Schema): unknown {
  try {
    return schema(undefined as never);
  } catch {
    if (schema.type === 'object') return {};
    if (schema.type === 'array') return [];
    if (schema.type === 'string') return '';
    return null;
  }
}

function SchemaNode(props: NodeProps) {
  const { schema } = props;
  if (schema.meta?.hidden) return null;
  if (schema.type === 'object') return <ObjectNode {...props} />;
  if (schema.type === 'array') return <ArrayNode {...props} />;
  if (isScalar(schema)) return <ScalarControl {...props} />;
  return <JsonControl {...props} />;
}

function ScalarControl({ schema, value, onChange, disabled, path }: NodeProps) {
  const id = `kb-schema-${path}`;
  switch (schema.type) {
    case 'string':
      return schema.meta?.role === 'textarea' ? (
        <Textarea id={id} value={(value as string) ?? ''} onChange={onChange} disabled={disabled} rows={4} />
      ) : (
        <Input id={id} type={schema.meta?.role === 'secret' ? 'password' : 'text'} value={(value as string) ?? ''} onChange={onChange} disabled={disabled} />
      );
    case 'number':
    case 'natural':
    case 'percent':
      return (
        <NumberInput
          id={id}
          value={(value as number) ?? null}
          onChange={(v) => onChange(v ?? undefined)}
          min={schema.meta?.min ?? (schema.type === 'natural' ? 0 : undefined)}
          max={schema.meta?.max}
          step={schema.meta?.step}
          disabled={disabled}
        />
      );
    case 'boolean':
      return <Switch checked={!!value} onChange={onChange} disabled={disabled} label={describe(schema, path)} />;
    default:
      return <Select id={id} value={(value as string) ?? null} options={optionsOf(schema)} onChange={(v) => onChange(v ?? undefined)} disabled={disabled} />;
  }
}

function JsonControl({ value, onChange, disabled, path }: NodeProps) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState(false);
  return (
    <Textarea
      id={`kb-schema-${path}`}
      value={text}
      invalid={error}
      rows={4}
      disabled={disabled}
      onChange={(next) => {
        setText(next);
        try {
          onChange(JSON.parse(next));
          setError(false);
        } catch {
          setError(true);
        }
      }}
    />
  );
}

function ObjectNode({ schema, value, onChange, disabled, path }: NodeProps) {
  const current = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const entries = Object.entries(schema.dict ?? {}).filter(([, s]) => !s.meta?.hidden);
  const set = (key: string, next: unknown) => onChange({ ...current, [key]: next });
  return (
    <div class="kb-schema__object">
      {entries.map(([key, child]) => {
        const childPath = path ? `${path}.${key}` : key;
        const label = describe(child, key);
        if (isScalar(child) || (child.type !== 'object' && child.type !== 'array')) {
          return (
            <div key={key} class="kb-schema__row">
              <label class={cx('kb-schema__label', child.meta?.required && 'is-required')} for={`kb-schema-${childPath}`}>
                {label}
              </label>
              <div class="kb-schema__control">
                <SchemaNode schema={child} value={current[key]} onChange={(v) => set(key, v)} disabled={disabled} path={childPath} />
              </div>
            </div>
          );
        }
        return (
          <fieldset key={key} class="kb-schema__group">
            <legend class="kb-schema__legend">{label}</legend>
            <SchemaNode schema={child} value={current[key]} onChange={(v) => set(key, v)} disabled={disabled} path={childPath} />
          </fieldset>
        );
      })}
    </div>
  );
}

function ArrayNode({ schema, value, onChange, disabled, path }: NodeProps) {
  const inner = schema.inner!;
  const list = Array.isArray(value) ? value : [];
  if (isConstUnion(inner)) {
    return <CheckboxGroup value={list as (string | number)[]} options={optionsOf(inner)} onChange={onChange} disabled={disabled} />;
  }
  const update = (index: number, next: unknown) => onChange(list.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => onChange(list.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...list, initialOf(inner)]);
  const itemActions = (index: number) => (
    <span class="kb-schema__item-actions">
      <IconButton icon="arrow-up" title="上移" disabled={disabled || index === 0} onClick={() => move(index, -1)} />
      <IconButton icon="arrow-down" title="下移" disabled={disabled || index === list.length - 1} onClick={() => move(index, 1)} />
      <IconButton icon="trash" title="删除" disabled={disabled} onClick={() => remove(index)} />
    </span>
  );
  const addButton = (
    <Button icon="plus" size="sm" disabled={disabled} onClick={add}>
      添加
    </Button>
  );

  if (inner.type === 'object' && schema.meta?.role === 'table') {
    const columns = Object.entries(inner.dict ?? {}).filter(([, s]) => !s.meta?.hidden);
    return (
      <div class="kb-schema__table-wrap">
        <table class="kb-table kb-schema__table">
          <thead>
            <tr>
              {columns.map(([key, s]) => (
                <th key={key} class={cx(s.meta?.required && 'is-required')}>
                  {describe(s, key)}
                </th>
              ))}
              <th class="kb-table__action" />
            </tr>
          </thead>
          <tbody>
            {list.map((item, index) => {
              const row = (item ?? {}) as Record<string, unknown>;
              return (
                <tr key={index}>
                  {columns.map(([key, s]) => (
                    <td key={key}>
                      <SchemaNode
                        schema={s}
                        value={row[key]}
                        onChange={(v) => update(index, { ...row, [key]: v })}
                        disabled={disabled}
                        path={`${path}.${index}.${key}`}
                      />
                    </td>
                  ))}
                  <td class="kb-table__action">{itemActions(index)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {addButton}
      </div>
    );
  }

  return (
    <div class="kb-schema__list">
      {list.map((item, index) =>
        isScalar(inner) ? (
          <div key={index} class="kb-schema__list-item">
            <SchemaNode schema={inner} value={item} onChange={(v) => update(index, v)} disabled={disabled} path={`${path}.${index}`} />
            {itemActions(index)}
          </div>
        ) : (
          <div key={index} class="kb-schema__card">
            <div class="kb-schema__card-header">
              <span class="kb-schema__card-title">{cardTitle(item, index)}</span>
              {itemActions(index)}
            </div>
            <SchemaNode schema={inner} value={item} onChange={(v) => update(index, v)} disabled={disabled} path={`${path}.${index}`} />
          </div>
        ),
      )}
      {addButton}
    </div>
  );
}

/** 卡片标题：优先取对象的 title / name / label 字段 */
function cardTitle(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const text = o.title ?? o.name ?? o.label;
    if (typeof text === 'string' && text) return text;
  }
  return `第 ${index + 1} 项`;
}
