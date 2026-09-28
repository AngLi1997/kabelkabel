import type { PanelViewProps } from '@kabel/core';
import { Button, Icon, useKernel, useSelector } from '@kabel/ui';

/** 校验结果：按 Schema 顺序列出错误，点击定位到字段 */
export function ValidationPanel(_: PanelViewProps) {
  const kernel = useKernel();
  const errors = useSelector((s) => s.metadata.errors);
  const fields = useSelector((s) => s.metadata.schema.fields);
  const validatedAt = useSelector((s) => s.metadata.validatedAt);
  const list = Object.keys(fields).filter((key) => errors[key]);

  if (!list.length) {
    return (
      <div class="kb-inspector__state">
        {validatedAt !== null ? (
          <span class="kb-inspector__ok">
            <Icon name="success" />
            校验通过
          </span>
        ) : (
          <Button icon="validate" size="sm" onClick={() => void kernel.execute('metadata.validate')}>
            执行校验
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul class="kb-inspector__list kb-scroll">
      {list.map((key) => (
        <li key={key}>
          <button type="button" class="kb-inspector__issue" onClick={() => void kernel.execute('metadata.focusField', key)}>
            <Icon name="error" />
            <span class="kb-inspector__field">{fields[key]!.label}</span>
            <span class="kb-inspector__message">{errors[key]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
