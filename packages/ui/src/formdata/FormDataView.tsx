import { collectFormConfigEntries, collectFormEntries, type DialogViewProps, type FormDataEntry, type Kernel } from '@kabel/core';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { Tabs } from '../components/Tabs';
import { DialogFooter } from '../feedback/DialogHost';
import { cx, downloadFile } from '../utils';

const ALL = '*';

/** 弹窗的两页：提交数据（`save` 载荷的 `data`）与表单配置（插件、布局、主题及各插件贡献的配置） */
export type FormDataViewTab = 'data' | 'config';

const TABS: { id: FormDataViewTab; title: string; empty: string; file: string }[] = [
  { id: 'data', title: '表单数据', empty: '暂无表单数据', file: 'form-data' },
  { id: 'config', title: '表单配置', empty: '暂无表单配置', file: 'form-config' },
];

const collectors: Record<FormDataViewTab, (kernel: Kernel) => Promise<FormDataEntry[]>> = {
  data: collectFormEntries,
  config: async (kernel) => [{ id: 'instanceId', title: '实例', data: kernel.id }, ...(await collectFormConfigEntries(kernel))],
};

const toRecord = (entries: FormDataEntry[]) =>
  Object.fromEntries(entries.map((e) => [e.id, e.error !== undefined ? { error: e.error } : e.data]));

/** 函数（如列的 `format`、自定义 `fetch`）显示为 `ƒ name`，`Infinity` 显示为字符串，避免被 JSON 丢弃 */
const replacer = (_key: string, value: unknown) =>
  typeof value === 'function' ? `ƒ ${value.name || 'anonymous'}` : value === Infinity ? 'Infinity' : value;
const stringify = (value: unknown) => JSON.stringify(value, replacer, 2) ?? 'undefined';

/**
 * 表单数据弹窗内容：上方切换“表单数据 / 表单配置”，打开或切换时收集一次；
 * 左侧按提供者分类（含“全部”），右侧为格式化 JSON；外框由底座弹窗提供。
 */
export function FormDataView({ kernel, close, props }: DialogViewProps<{ tab?: FormDataViewTab } | undefined>) {
  const [tab, setTab] = useState<FormDataViewTab>(props?.tab ?? 'data');
  const [entries, setEntries] = useState<FormDataEntry[] | null>(null);
  const [active, setActive] = useState(ALL);
  const [copied, setCopied] = useState(false);
  const meta = TABS.find((t) => t.id === tab)!;

  const refresh = () => {
    setEntries(null);
    collectors[tab](kernel).then(setEntries, (error) => setEntries([{ id: 'error', title: '错误', error: String(error) }]));
  };
  useEffect(refresh, [kernel, tab]);

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
      <Tabs
        class="kb-formdata__tabs"
        items={TABS}
        active={tab}
        onChange={(id) => {
          setTab(id as FormDataViewTab);
          setActive(ALL);
        }}
      />
      <div class="kb-formdata">
        <nav class="kb-formdata__nav" role="tablist" aria-orientation="vertical">
          {nav(ALL, '全部')}
          {entries?.map((e) => nav(e.id, e.title, e.error !== undefined))}
        </nav>
        <div class="kb-formdata__content kb-scroll" role="tabpanel">
          {!entries ? <Empty text="正在收集…" /> : !entries.length ? <Empty text={meta.empty} /> : <pre class="kb-formdata__json">{text}</pre>}
        </div>
      </div>
      <DialogFooter>
        <Button icon="reset" onClick={refresh}>刷新</Button>
        <Button icon="file" disabled={!entries} onClick={copy}>{copied ? '已复制' : '复制'}</Button>
        <Button
          icon="download"
          disabled={!entries}
          onClick={() => downloadFile(`${current ? `${meta.file}.${current.id}` : meta.file}.json`, text, 'application/json')}
        >
          下载
        </Button>
        <Button variant="primary" onClick={close}>关闭</Button>
      </DialogFooter>
    </>
  );
}
