import type { PanelViewProps } from '@kabel/core';
import { Button, cx, Empty, IconButton, Select, useKernel, useSelector } from '@kabel/ui';
import { useEffect, useRef } from 'preact/hooks';
import { annotationActions, annotatorActions } from './slice';
import type { Annotation } from './types';

const EMPTY: Annotation[] = [];

/** 右侧标记列表：当前页的标记，可修改类型、删除，底部导出 */
export function AnnotationList(_: PanelViewProps) {
  const kernel = useKernel();
  const imageId = useSelector((s) => s.viewer?.images[s.viewer.index]?.id);
  const boxes = useSelector((s) => (imageId ? s.annotations?.[imageId] ?? EMPTY : EMPTY));
  const total = useSelector((s) => Object.values(s.annotations ?? {}).reduce((n, list) => n + list.length, 0));
  const labels = useSelector((s) => s.annotator?.labels ?? []);
  const selected = useSelector((s) => s.annotator?.selected);
  const list = useRef<HTMLDivElement>(null);

  // 在影像上选中标记时滚动到对应行
  useEffect(() => {
    if (!selected) return;
    list.current?.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const options = labels.map((l) => ({ label: l.name, value: l.id }));
  const colorOf = (id: string) => labels.find((l) => l.id === id)?.color;

  return (
    <div class="kb-anno-list">
      <div ref={list} class="kb-anno-list__body kb-scroll" onPointerLeave={() => kernel.dispatch(annotatorActions.hover(null))}>
        {!imageId || !boxes.length ? (
          <Empty icon="box" text={imageId ? '本页暂无标记' : '暂无影像'} />
        ) : (
          boxes.map((box, i) => (
            <div
              key={box.id}
              data-id={box.id}
              class={cx('kb-anno-list__row', box.id === selected && 'is-selected')}
              style={{ '--kb-anno-color': colorOf(box.label) }}
              onClick={() => kernel.dispatch(annotatorActions.select(box.id === selected ? null : box.id))}
              onPointerEnter={() => kernel.dispatch(annotatorActions.hover(box.id))}
            >
              <span class="kb-anno-list__index">{i + 1}</span>
              <div class="kb-anno-list__label" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={box.label}
                  options={options}
                  onChange={(label) =>
                    label != null &&
                    kernel.dispatch(
                      annotationActions.update(
                        { imageId: imageId!, id: box.id, patch: { label: String(label) } },
                        { history: { label: '修改标记类型' } },
                      ),
                    )
                  }
                />
              </div>
              <span class="kb-anno-list__bbox" title="x, y, 宽 × 高（像素）">
                {box.x}, {box.y}　{box.w}×{box.h}
              </span>
              <IconButton
                icon="trash"
                title="删除标记"
                onClick={(e) => {
                  e.stopPropagation();
                  kernel.dispatch(annotationActions.remove({ imageId: imageId!, id: box.id }, { history: { label: '删除标记' } }));
                }}
              />
            </div>
          ))
        )}
      </div>
      <div class="kb-anno-list__footer">
        <span class="kb-anno-list__count">
          本页 {boxes.length} · 共 {total}
        </span>
        <Button size="sm" icon="download" disabled={!total} onClick={() => void kernel.execute('annotation.exportJson')}>
          JSON
        </Button>
        <Button size="sm" icon="download" disabled={!total} onClick={() => void kernel.execute('annotation.exportYolo')}>
          YOLO
        </Button>
      </div>
    </div>
  );
}
