import { collectFormEntries, type FormDataEntry } from '@kabel/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button, IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { useKernel, useSelector } from '../hooks';
import { cx, downloadFile } from '../utils';
import { formDataViewActions } from './formdata-plugin';

/** 表单数据弹窗：打开时收集一次，左侧按插件分类（含“全部”），右侧为格式化 JSON */
export function FormDataDialog() {
  const open = useSelector((s) => !!s.formDataView?.open);
  return open ? <Dialog /> : null;
}

const ALL = '*';
const toRecord = (entries: FormDataEntry[]) =>
  Object.fromEntries(entries.map((e) => [e.id, e.error !== undefined ? { error: e.error } : e.data]));
const stringify = (value: unknown) => JSON.stringify(value, null, 2) ?? 'undefined';

function Dialog() {
  const kernel = useKernel();
  const [entries, setEntries] = useState<FormDataEntry[] | null>(null);
  const [active, setActive] = useState(ALL);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `kb-formdata-title-${kernel.id}`;
  const close = () => kernel.dispatch(formDataViewActions.close());

  const refresh = () => {
    setEntries(null);
    collectFormEntries(kernel).then(setEntries, (error) => setEntries([{ id: 'error', title: '错误', error: String(error) }]));
  };
  useEffect(refresh, [kernel]);

  useEffect(() => {
    const previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const current = entries?.find((e) => e.id === active);
  const text = !entries ? '' : current ? stringify(current.error !== undefined ? { error: current.error } : current.data) : stringify(toRecord(entries));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  const nav = (id: string, title: string, error?: boolean) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={id === active}
      class={cx('kb-settings__nav-item', id === active && 'is-active', error && 'is-error')}
      onClick={() => setActive(id)}
    >
      <span>{title}</span>
    </button>
  );

  return (
    <div
      class="kb-settings kb-formdata"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
      }}
    >
      <div ref={dialog} class="kb-settings__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header class="kb-settings__header">
          <span id={titleId} class="kb-settings__title">
            表单数据
          </span>
          <div class="kb-formdata__tools">
            <Button size="sm" icon="reset" onClick={refresh}>刷新</Button>
            <Button size="sm" icon="file" disabled={!entries} onClick={copy}>{copied ? '已复制' : '复制'}</Button>
            <Button
              size="sm"
              icon="download"
              disabled={!entries}
              onClick={() => downloadFile(`${current?.id ?? 'form-data'}.json`, text, 'application/json')}
            >
              下载
            </Button>
            <IconButton icon="close" title="关闭 (Esc)" onClick={close} />
          </div>
        </header>
        <div class="kb-settings__body">
          <nav class="kb-settings__nav" role="tablist" aria-orientation="vertical">
            {nav(ALL, '全部')}
            {entries?.map((e) => nav(e.id, e.title, e.error !== undefined))}
          </nav>
          <div class="kb-settings__content kb-formdata__content kb-scroll" role="tabpanel">
            {!entries ? <Empty text="正在收集…" /> : !entries.length ? <Empty text="暂无表单数据" /> : <pre class="kb-formdata__json">{text}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
