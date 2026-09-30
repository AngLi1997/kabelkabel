import type { PanelViewProps } from '@kabel/core';
import { cx, Empty, Icon, useKernel, useSelector } from '@kabel/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import { documentsActions, groupDocuments } from './slice';

/**
 * 文件目录：列出当前工具打开的全部文件，按目录分组，点击切换内容区域显示的文件。
 * 切换文件时自动展开所在目录并滚动到可见位置。
 */
export function FileList(_: PanelViewProps) {
  const kernel = useKernel();
  const items = useSelector((s) => s.documents.items);
  const index = useSelector((s) => s.documents.index);
  const loading = useSelector((s) => s.documents.loading);
  const groups = groupDocuments(items);
  const grouped = groups.some((g) => g.name);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const list = useRef<HTMLDivElement>(null);
  const current = groups.find((g) => index >= g.start && index < g.start + g.items.length);

  useEffect(() => {
    if (current && folded[current.name]) setFolded((f) => ({ ...f, [current.name]: false }));
    list.current?.querySelector('.kb-files__item.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }, [index, current?.name]);

  if (!items.length) return <Empty icon="folder" text={loading ? '文件加载中' : '暂无文件'} />;

  return (
    <div ref={list} class="kb-files kb-scroll" role="listbox" aria-label="文件目录">
      {groups.map((group) => {
        const isFolded = grouped && !!folded[group.name];
        return (
          <div key={`${group.start}:${group.name}`} class="kb-files__group" role="group" aria-label={group.name || undefined}>
            {grouped && (
              <button
                type="button"
                class={cx('kb-files__folder', group === current && 'is-current')}
                aria-expanded={!isFolded}
                onClick={() => setFolded((f) => ({ ...f, [group.name]: !isFolded }))}
              >
                <Icon name={isFolded ? 'chevron-right' : 'chevron-down'} />
                <Icon name="folder" />
                <span class="kb-files__name">{group.name || '未分组'}</span>
                <span class="kb-files__count">{group.items.length}</span>
              </button>
            )}
            {!isFolded &&
              group.items.map((item, i) => {
                const at = group.start + i;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={at === index}
                    class={cx('kb-files__item', grouped && 'is-nested', at === index && 'is-active')}
                    title={item.name}
                    data-kb-context="document"
                    data-kb-context-data={String(at)}
                    onClick={() => kernel.dispatch(documentsActions.goto(at))}
                  >
                    <Icon name={item.kind === 'image' ? 'image' : 'file'} />
                    <span class="kb-files__name">{item.name}</span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
