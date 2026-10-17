import type { Kernel } from '@kabel/core';
import { Button, IconButton, Textarea, useSelector } from '@kabel/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ExchangeControl, ExchangeFormat } from './contract';

/** 三个工具栏控件共用同一套文字按钮样式 */
export const EXCHANGE_CONTROLS: Record<ExchangeControl, { title: string; icon: string; label: string }> = {
  load: { title: '加载数据', icon: 'file', label: '加载数据' },
  view: { title: '查看数据', icon: 'eye', label: '查看数据' },
  export: { title: '导出数据', icon: 'download', label: '导出数据' },
};

export function ExchangeControls({
  kernel,
  controls,
  format,
  onClosePreview,
  onCloseLoader,
}: {
  kernel: Kernel;
  controls: readonly ExchangeControl[];
  format: ExchangeFormat;
  onClosePreview: () => void;
  onCloseLoader: () => void;
}) {
  const busy = useSelector((s) => s.dataExchange?.busy ?? null);
  const preview = useSelector((s) => s.dataExchange?.preview ?? null);
  const loader = useSelector((s) => s.dataExchange?.loader ?? false);
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
      {preview !== null && <PreviewDialog text={preview} onClose={onClosePreview} />}
      {loader && <LoadDialog kernel={kernel} format={format} busy={busy !== null} onClose={onCloseLoader} />}
    </div>
  );
}

const ACCEPT: Record<ExchangeFormat, string> = {
  json: '.json,application/json',
  yaml: '.yaml,.yml,application/yaml,text/yaml',
};

function LoadDialog({ kernel, format, busy, onClose }: { kernel: Kernel; format: ExchangeFormat; busy: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const label = format === 'json' ? 'JSON' : 'YAML';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };
  return (
    <div class="kb-dx__modal" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        ref={dialog}
        class="kb-dx__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="加载数据"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header class="kb-dx__header">
          <span>加载数据</span>
          <IconButton icon="close" title="关闭" disabled={busy} onClick={onClose} />
        </header>
        <div class="kb-dx__body">
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
        </div>
        <footer class="kb-dx__footer">
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void kernel.execute('dataExchange.apply', text)}>
            加载
          </Button>
        </footer>
      </div>
    </div>
  );
}

function PreviewDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div class="kb-dx__modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        class="kb-dx__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="查看数据"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header class="kb-dx__header">
          <span>查看数据</span>
          <IconButton icon="close" title="关闭" onClick={onClose} />
        </header>
        <pre class="kb-dx__pre">{text}</pre>
      </div>
    </div>
  );
}
