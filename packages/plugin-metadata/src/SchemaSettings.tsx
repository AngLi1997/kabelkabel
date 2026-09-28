import type { SettingsPageProps } from '@kabel/core';
import { Button, downloadFile, Empty, Switch, useContributions, useSelector } from '@kabel/ui';
import { Fragment } from 'preact';
import { useRef } from 'preact/hooks';
import { FieldTypes } from './field-types';
import { toSchemaInput } from './schema';
import { METADATA_SERVICE } from './service';
import type { MetadataSchema, NormalizedField } from './types';

/**
 * 设置 › 著录项：查看当前著录项方案，切换字段必填 / 显示，导入导出 Schema JSON。
 * 修改通过 `setSchema` 生效并派发 `schema:change`，由宿主决定是否持久化。
 */
export function SchemaSettings({ kernel }: SettingsPageProps) {
  const schema = useSelector((s) => s.metadata?.schema);
  const types = useContributions(FieldTypes);
  const file = useRef<HTMLInputElement>(null);
  const service = kernel.services.tryGet(METADATA_SERVICE);
  if (!schema || !service) return null;

  const typeTitle = (id: string) => types.find((t) => t.id === id)?.title ?? id;
  const apply = (next: MetadataSchema) => {
    try {
      service.setSchema(next);
      kernel.bus.emit('schema:change', { schema: toSchemaInput(kernel.getState().metadata.schema) });
    } catch (error) {
      kernel.bus.emit('error', { error, source: 'metadata.schema' });
    }
  };
  const patchField = (key: string, patch: Partial<NormalizedField>) => {
    const next = toSchemaInput(schema);
    for (const group of next.groups) group.fields = group.fields.map((f) => (f.key === key ? { ...f, ...patch } : f));
    apply(next);
  };
  const onImport = async (input: HTMLInputElement) => {
    const picked = input.files?.[0];
    input.value = '';
    if (picked) apply(JSON.parse(await picked.text()) as MetadataSchema);
  };

  return (
    <div class="kb-md-settings">
      {schema.groups.length ? (
        <table class="kb-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>标识</th>
              <th>类型</th>
              <th class="kb-table__action">必填</th>
              <th class="kb-table__action">显示</th>
            </tr>
          </thead>
          <tbody>
            {schema.groups.map((group) => (
              <Fragment key={group.key}>
                <tr class="kb-table__group">
                  <td colSpan={5}>{group.title}</td>
                </tr>
                {group.fields.map((field) => (
                  <tr key={field.key} class={field.hidden ? 'is-disabled' : undefined}>
                    <td>{field.label}</td>
                    <td class="kb-table__code">{field.key}</td>
                    <td>{typeTitle(field.type)}</td>
                    <td class="kb-table__action">
                      <Switch
                        checked={!!field.required}
                        label={`${field.label}必填`}
                        onChange={(required) => patchField(field.key, { required })}
                      />
                    </td>
                    <td class="kb-table__action">
                      <Switch
                        checked={!field.hidden}
                        label={`显示${field.label}`}
                        onChange={(visible) => patchField(field.key, { hidden: !visible })}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty icon="list" text="暂无著录项" />
      )}
      <div class="kb-md-settings__actions">
        <Button icon="download" onClick={() => downloadFile(`${schema.id}.json`, JSON.stringify(toSchemaInput(schema), null, 2), 'application/json')}>
          导出 JSON
        </Button>
        <Button icon="file" onClick={() => file.current?.click()}>
          导入 JSON
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onImport(e.currentTarget).catch((error) => kernel.bus.emit('error', { error, source: 'metadata.schema' }))}
        />
        <Button icon="reset" onClick={() => void kernel.execute('metadata.resetSchema')}>
          恢复初始方案
        </Button>
      </div>
    </div>
  );
}
