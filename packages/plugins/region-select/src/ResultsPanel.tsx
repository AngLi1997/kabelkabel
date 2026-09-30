import { Empty, Icon, IconButton } from '@kabel/ui';
import { useEffect, useState } from 'preact/hooks';
import type { ResultList } from './results';

/** 右侧“框选结果”面板：最近的用户框选，可下载、移除 */
export function ResultsPanel({ results }: { results: ResultList }) {
  const [items, setItems] = useState(results.get());
  useEffect(() => {
    setItems(results.get());
    return results.subscribe(() => setItems(results.get()));
  }, [results]);

  if (!items.length) return <Empty icon="box" text="暂无框选结果" />;
  return (
    <div class="kb-rsel-results">
      <div class="kb-rsel-results__bar">
        <span>{items.length} 条</span>
        <IconButton icon="trash" title="清空" onClick={() => results.clear()} />
      </div>
      {items.map((item) => (
        <figure key={item.id} class="kb-rsel-results__item">
          <img src={item.url} alt={item.name} draggable={false} />
          <figcaption>
            <span title={item.name}>{item.label}</span>
            <a class="kb-btn kb-btn--text kb-btn--sm kb-btn--icon" href={item.url} download={item.name} title="下载">
              <Icon name="download" />
            </a>
            <IconButton icon="close" title="移除" onClick={() => results.remove(item.id)} />
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
