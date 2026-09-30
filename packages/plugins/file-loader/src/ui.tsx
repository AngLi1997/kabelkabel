import type { Kernel } from '@kabel/core';
import { Button, IconButton, Input, Textarea, useSelector } from '@kabel/ui';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FILE_LOADER_SERVICE, type MinioConfig } from './contract';
import { fileLoaderActions } from './slice';

const MENU: { command: string; label: string }[] = [
  { command: 'fileLoader.openDirectory', label: '本地目录…' },
  { command: 'fileLoader.openMinio', label: 'MinIO 桶与路径…' },
  { command: 'fileLoader.openUrls', label: 'URL 列表…' },
];

/** 工具栏“打开”菜单与两个表单对话框（MinIO、URL 列表） */
export function LoaderToolbar({ kernel, defaults }: { kernel: Kernel; defaults?: Partial<MinioConfig> }) {
  const dialog = useSelector((s) => s.fileLoader?.dialog ?? null);
  const busy = useSelector((s) => !!s.fileLoader?.busy);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // 工具栏可能溢出滚动/裁剪，菜单用 fixed 定位，按按钮位置计算坐标
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const toggle = () => {
    const rect = root.current?.getBoundingClientRect();
    if (rect) setPos({ left: rect.left, top: rect.bottom + 2 });
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div class="kb-fl" ref={root}>
      <Button icon="folder" variant="text" size="sm" disabled={busy} active={open} title="打开文件" onClick={toggle}>
        {busy ? '加载中…' : '打开'}
      </Button>
      {open && (
        <div class="kb-fl__menu" role="menu" style={{ left: `${pos.left}px`, top: `${pos.top}px` }}>
          {MENU.map((item) => (
            <button
              key={item.command}
              type="button"
              role="menuitem"
              class="kb-fl__menu-item"
              onClick={() => {
                setOpen(false);
                void kernel.execute(item.command);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {dialog === 'urls' && <UrlsDialog kernel={kernel} />}
      {dialog === 'minio' && <MinioDialog kernel={kernel} defaults={defaults} />}
    </div>
  );
}

function Modal({ title, kernel, onSubmit, submitLabel, busy, children }: { title: string; kernel: Kernel; onSubmit: () => void; submitLabel: string; busy: boolean; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const close = () => kernel.dispatch(fileLoaderActions.openDialog(null));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input,textarea')?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div class="kb-fl__modal" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={box}
        class="kb-fl__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && !busy) {
            e.preventDefault();
            onSubmit();
          }
        }}
      >
        <header class="kb-fl__header">
          <span class="kb-fl__title">{title}</span>
          <IconButton icon="close" title="关闭 (Esc)" onClick={close} />
        </header>
        <div class="kb-fl__body">{children}</div>
        <footer class="kb-fl__footer">
          <Button onClick={close}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={onSubmit}>
            {busy ? '加载中…' : submitLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ComponentChildren }) => (
  <label class="kb-fl__field">
    <span class="kb-fl__label">{label}</span>
    {children}
  </label>
);

/** 提交：成功后关闭对话框；失败保留内容（提示已由服务发出） */
function useSubmit(kernel: Kernel, run: () => Promise<unknown>) {
  const busy = useSelector((s) => !!s.fileLoader?.busy);
  const submit = () =>
    run().then(
      () => kernel.dispatch(fileLoaderActions.openDialog(null)),
      () => {},
    );
  return { busy, submit };
}

function UrlsDialog({ kernel }: { kernel: Kernel }) {
  const [text, setText] = useState('');
  const { busy, submit } = useSubmit(kernel, () => kernel.services.get(FILE_LOADER_SERVICE).loadUrls(text));
  return (
    <Modal title="从 URL 列表加载" kernel={kernel} onSubmit={submit} submitLabel="加载" busy={busy}>
      <Field label="URL（每行一个，也可用逗号分隔）">
        <Textarea rows={8} value={text} onChange={setText} placeholder={'https://example.com/scans/001.jpg\nhttps://example.com/scans/002.jpg'} />
      </Field>
    </Modal>
  );
}

function MinioDialog({ kernel, defaults }: { kernel: Kernel; defaults?: Partial<MinioConfig> }) {
  const [form, setForm] = useState({
    endpoint: defaults?.endpoint ?? '',
    bucket: defaults?.bucket ?? '',
    prefix: defaults?.prefix ?? '',
    accessKey: defaults?.accessKey ?? '',
    secretKey: defaults?.secretKey ?? '',
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const { busy, submit } = useSubmit(kernel, () =>
    kernel.services.get(FILE_LOADER_SERVICE).loadMinio({
      ...defaults,
      endpoint: form.endpoint.trim(),
      bucket: form.bucket.trim(),
      prefix: form.prefix.trim(),
      accessKey: form.accessKey.trim() || undefined,
      secretKey: form.secretKey || undefined,
    }),
  );
  return (
    <Modal title="从 MinIO 加载" kernel={kernel} onSubmit={submit} submitLabel="加载" busy={busy}>
      <Field label="服务地址">
        <Input value={form.endpoint} onChange={set('endpoint')} placeholder="http://127.0.0.1:9000" />
      </Field>
      <div class="kb-fl__row">
        <Field label="桶">
          <Input value={form.bucket} onChange={set('bucket')} placeholder="archive" />
        </Field>
        <Field label="路径前缀">
          <Input value={form.prefix} onChange={set('prefix')} placeholder="2024/case-01/" />
        </Field>
      </div>
      <div class="kb-fl__row">
        <Field label="Access Key（公开桶可留空）">
          <Input value={form.accessKey} onChange={set('accessKey')} />
        </Field>
        <Field label="Secret Key">
          <input type="password" class="kb-input" autocomplete="off" value={form.secretKey} onInput={(e) => set('secretKey')(e.currentTarget.value)} />
        </Field>
      </div>
    </Modal>
  );
}
