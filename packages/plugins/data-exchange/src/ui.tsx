import type { DialogViewProps, Kernel } from '@kabel/core';
import { Button, DialogBody, DialogFooter, Textarea, useSelector } from '@kabel/ui';
import { useRef, useState } from 'preact/hooks';
import type { ExchangeControl, ExchangeFormat } from './contract';

/** 三个工具栏控件共用同一套文字按钮样式 */
export const EXCHANGE_CONTROLS: Record<ExchangeControl, { title: string; icon: string; label: string }> = {
  load: { title: '加载数据', icon: 'file', label: '加载数据' },
  view: { title: '查看数据', icon: 'eye', label: '查看数据' },
  export: { title: '导出数据', icon: 'download', label: '导出数据' },
};

export function ExchangeControls({ kernel, controls }: { kernel: Kernel; controls: readonly ExchangeControl[] }) {
  const busy = useSelector((s) => s.dataExchange?.busy ?? null);
  return (
    <div class="kb-dx">
      {controls.map((id) => {
        const item = EXCHANGE_CONTROLS[id];
        return (
          <Button key={id} icon={item.icon} variant="text" disabled={busy !== null} title={item.title} onClick={() => void kernel.execute(`dataExchange.${id}`)}>
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

const ACCEPT: Record<ExchangeFormat, string> = {
  json: '.json,application/json',
  yaml: '.yaml,.yml,application/yaml,text/yaml',
};

/** 加载数据弹窗的内容：选择文件或粘贴文本 */
export function LoadDialog({ kernel, close, format }: DialogViewProps & { format: ExchangeFormat }) {
  const busy = useSelector((s) => s.dataExchange?.busy != null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const label = format === 'json' ? 'JSON' : 'YAML';
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };
  return (
    <>
      <DialogBody class="kb-dx__body">
        <div class="kb-dx__file">
          <Button icon="folder" disabled={busy} onClick={() => fileRef.current?.click()}>
            {`选择 ${label} 文件`}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT[format]}
            onChange={(e) => {
              const input = e.currentTarget as HTMLInputElement;
              void readFile(input.files?.[0]);
              input.value = '';
            }}
          />
          {fileName ? <span class="kb-dx__name">{fileName}</span> : null}
        </div>
        <Textarea rows={12} value={text} disabled={busy} placeholder={`粘贴 ${label}`} onChange={setText} />
      </DialogBody>
      <DialogFooter>
        <Button disabled={busy} onClick={close}>
          取消
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void kernel.execute('dataExchange.apply', text)}>
          加载
        </Button>
      </DialogFooter>
    </>
  );
}

/** 查看数据弹窗的内容：序列化后的文本 */
export function PreviewDialog({ props }: DialogViewProps<{ text: string }>) {
  return <pre class="kb-dx__pre">{props.text}</pre>;
}
