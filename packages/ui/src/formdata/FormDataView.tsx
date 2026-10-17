import { collectFormEntries, type DialogViewProps, type FormDataEntry } from '@kabel/core';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { DialogFooter } from '../feedback/DialogHost';
import { cx, downloadFile } from '../utils';

const ALL = '*';
const toRecord = (entries: FormDataEntry[]) =>
  Object.fromEntries(entries.map((e) => [e.id, e.error !== undefined ? { error: e.error } : e.data]));
const stringify = (value: unknown) => JSON.stringify(value, null, 2) ?? 'undefined';

/** 表单数据弹窗内容：打开时收集一次，左侧按插件分类（含“全部”），右侧为格式化 JSON；外框由底座弹窗提供 */
export function FormDataView({ kernel, close }: DialogViewProps) {
  const [entries, setEntries] = useState<FormDataEntry[] | null>(null);
  const [active, setActive] = useState(ALL);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    setEntries(null);
    collectFormEntries(kernel).then(setEntries, (error) => setEntries([{ id: 'error', title: '错误', error: String(error) }]));
  };
  useEffect(refresh, [kernel]);

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
      class={cx('kb-formdata__nav-item', id === active && 'is-active', error && 'is-error')}
      onClick={() => setActive(id)}
    >
      {title}
    </button>
  );

  return (
    <>
      <div class="kb-formdata">
        <nav class="kb-formdata__nav" role="tablist" aria-orientation="vertical">
          {nav(ALL, '全部')}
          {entries?.map((e) => nav(e.id, e.title, e.error !== undefined))}
        </nav>
        <div class="kb-formdata__content kb-scroll" role="tabpanel">
          {!entries ? <Empty text="正在收集…" /> : !entries.length ? <Empty text="暂无表单数据" /> : <pre class="kb-formdata__json">{text}</pre>}
        </div>
      </div>
      <DialogFooter>
        <Button icon="reset" onClick={refresh}>刷新</Button>
        <Button icon="file" disabled={!entries} onClick={copy}>{copied ? '已复制' : '复制'}</Button>
        <Button icon="download" disabled={!entries} onClick={() => downloadFile(`${current?.id ?? 'form-data'}.json`, text, 'application/json')}>
          下载
        </Button>
        <Button variant="primary" onClick={close}>关闭</Button>
      </DialogFooter>
    </>
  );
}
