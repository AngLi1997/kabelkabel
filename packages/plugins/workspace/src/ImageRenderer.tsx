import {
  cx,
  Empty,
  Icon,
  IconButton,
  Resizer,
  runAction,
  useCommandsVersion,
  useContributions,
  useElementSize,
  useKernel,
  useSelector,
  useStoreState,
  ViewHost,
} from '@kabel/ui';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { documentPosition, documentsActions, groupDocuments } from './documents/slice';
import { WorkspaceExtensions, type DocumentRendererProps, type StageOverlayProps } from './extensions';
import type { ImageItem } from './sources';
import { currentScale, stageActions } from './stage';

const STAGE_PADDING = 12;
const DEG = Math.PI / 180;

/** 图片渲染器：当前文件（kind 为 image）的缩放 / 旋转 / 拖拽查看，含侧边工具条与覆盖层扩展点 */
export function ImageRenderer({ document }: DocumentRendererProps) {
  const kernel = useKernel();
  const view = useSelector((s) => s.stage);
  const images = useSelector((s) => s.documents.items);
  const index = useSelector((s) => s.documents.index);
  const loading = useSelector((s) => s.documents.loading);
  const { rotation, thumbnails, thumbSize } = view;
  const image = document as ImageItem;
  const scale = currentScale(view);

  const stage = useRef<HTMLDivElement>(null);
  const size = useElementSize(stage);
  // 尺寸与失败状态按 src 记录：切换图片后自然失效，避免缓存图片的 load 早于 effect 触发导致被重置
  const [loaded, setLoaded] = useState<{ src: string; w: number; h: number } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const natural = loaded && loaded.src === image?.src ? loaded : null;
  const failed = !!image && failedSrc === image.src;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const measure = (img: HTMLImageElement) => {
    if (img.naturalWidth) setLoaded({ src: img.getAttribute('src') ?? '', w: img.naturalWidth, h: img.naturalHeight || 1 });
  };

  useLayoutEffect(() => {
    setPan({ x: 0, y: 0 });
    const img = imgRef.current;
    if (img?.complete) measure(img);
  }, [image?.src]);

  useEffect(() => {
    if (view.zoom === 'fit') setPan({ x: 0, y: 0 });
  }, [view.zoom, rotation]);

  // 适应窗口比例随容器尺寸、旋转角度变化
  useLayoutEffect(() => {
    if (!natural || !size.width || !size.height) return;
    const turned = rotation % 180 !== 0;
    const w = turned ? natural.h : natural.w;
    const h = turned ? natural.w : natural.h;
    const fit = Math.min((size.width - STAGE_PADDING * 2) / w, (size.height - STAGE_PADDING * 2) / h);
    if (fit > 0) kernel.dispatch(stageActions.setFitScale(fit));
  }, [natural, size.width, size.height, rotation]);

  // 滚轮缩放（非被动监听，才能阻止页面滚动）
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!image) return;
      event.preventDefault();
      kernel.dispatch(stageActions.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [kernel, image]);

  const overlays = useContributions(WorkspaceExtensions.overlays);
  // 图片中心位于舞台中心 + 平移量；图片以中心为原点先旋转再缩放
  const cos = Math.cos(rotation * DEG);
  const sin = Math.sin(rotation * DEG);
  const cx0 = size.width / 2 + pan.x;
  const cy0 = size.height / 2 + pan.y;
  const overlayProps: Omit<StageOverlayProps, 'image'> | null = natural && {
    kernel,
    width: natural.w,
    height: natural.h,
    scale,
    rotation,
    toScreen: (x, y) => {
      const dx = (x - natural.w / 2) * scale;
      const dy = (y - natural.h / 2) * scale;
      return { x: cx0 + dx * cos - dy * sin, y: cy0 + dx * sin + dy * cos };
    },
    toImage: (x, y) => {
      const dx = x - cx0;
      const dy = y - cy0;
      return { x: (dx * cos + dy * sin) / scale + natural.w / 2, y: (-dx * sin + dy * cos) / scale + natural.h / 2 };
    },
  };

  // 左键或中键拖动平移（覆盖层已处理的事件不会冒泡到这里）
  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if ((event.button !== 0 && event.button !== 1) || !image) return;
    // 阻止中键自动滚动
    if (event.button === 1) event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setPan({ x: d.px + event.clientX - d.x, y: d.py + event.clientY - d.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, string> = {
      ArrowLeft: 'workspace.prev',
      ArrowRight: 'workspace.next',
      PageUp: 'workspace.prev',
      PageDown: 'workspace.next',
      '+': 'workspace.zoomIn',
      '=': 'workspace.zoomIn',
      '-': 'workspace.zoomOut',
      '0': 'workspace.fit',
    };
    const command = map[event.key];
    if (!command || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    void kernel.execute(command);
  };

  const run = (command: string) => () => void kernel.execute(command);
  const thumbStart = useRef(0);

  return (
    <div class="kb-stage">
      <div class="kb-stage__bar" role="toolbar" aria-orientation="vertical">
        <IconButton icon="chevron-up" title="上一页" disabled={index <= 0} onClick={run('workspace.prev')} />
        <PageIndicator />
        <IconButton icon="chevron-down" title="下一页" disabled={index >= images.length - 1} onClick={run('workspace.next')} />
        <span class="kb-stage__sep" />
        <IconButton icon="zoom-in" title="放大" disabled={!image} onClick={run('workspace.zoomIn')} />
        <span class="kb-stage__zoom">{Math.round(scale * 100)}%</span>
        <IconButton icon="zoom-out" title="缩小" disabled={!image} onClick={run('workspace.zoomOut')} />
        <IconButton icon="fit" title="适应窗口 (0)" active={view.zoom === 'fit'} disabled={!image} onClick={run('workspace.fit')} />
        <IconButton icon="actual-size" title="原始大小" disabled={!image} onClick={run('workspace.actual')} />
        <IconButton icon="rotate-left" title="向左旋转" disabled={!image} onClick={run('workspace.rotateLeft')} />
        <IconButton icon="rotate-right" title="向右旋转" disabled={!image} onClick={run('workspace.rotateRight')} />
        <IconButton icon="grid" title="缩略图" active={thumbnails} disabled={images.length < 2} onClick={run('workspace.toggleThumbnails')} />
        <PluginTools />
      </div>

      {thumbnails && images.length > 1 && (
        <>
          <Thumbnails width={thumbSize} />
          <Resizer
            axis="x"
            label="调整缩略图宽度"
            onStart={() => {
              thumbStart.current = thumbSize;
            }}
            onMove={(delta) => kernel.dispatch(stageActions.setThumbSize(thumbStart.current + delta))}
            onReset={() => kernel.dispatch(stageActions.setThumbSize(88))}
          />
        </>
      )}

      <div
        ref={stage}
        class={cx('kb-stage__canvas', image && 'is-ready')}
        tabIndex={0}
        aria-label="影像区域"
        data-kb-context="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDblClick={(e) => e.target === e.currentTarget || e.target === imgRef.current ? run(view.zoom === 'fit' ? 'workspace.actual' : 'workspace.fit')() : undefined}
        onKeyDown={onKeyDown}
      >
        {!image && <Empty icon="image" text={loading ? '影像加载中' : '暂无影像'} />}
        {image && failed && <Empty icon="image" text="影像加载失败" />}
        {image && !failed && (
          <img
            key={image.src}
            ref={imgRef}
            class="kb-stage__image"
            src={image.src}
            alt={image.name}
            draggable={false}
            style={{
              visibility: natural ? 'visible' : 'hidden',
              width: natural ? `${natural.w}px` : undefined,
              height: natural ? `${natural.h}px` : undefined,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
            }}
            onLoad={(e) => measure(e.currentTarget)}
            onError={() => setFailedSrc(image.src)}
          />
        )}
        {image && !failed && overlayProps && size.width > 0 &&
          overlays.map((overlay) => (
            <div key={overlay.id} class="kb-stage__overlay">
              <ViewHost view={overlay.view} props={{ ...overlayProps, image }} />
            </div>
          ))}
      </div>
    </div>
  );
}

/** 其他插件贡献到侧边工具条的按钮 */
function PluginTools() {
  const kernel = useKernel();
  const tools = useContributions(WorkspaceExtensions.tools);
  useStoreState();
  useCommandsVersion();
  if (!tools.length) return null;
  return (
    <>
      <span class="kb-stage__sep" />
      {tools.map((tool) => {
        const command = kernel.commands.get(tool.command);
        return (
          <IconButton
            key={tool.id}
            icon={tool.icon}
            title={tool.tooltip}
            active={command?.checked ? kernel.commands.isChecked(tool.command) : undefined}
            disabled={!kernel.commands.isEnabled(tool.command)}
            onClick={() => runAction(kernel, tool)}
          />
        );
      })}
    </>
  );
}

/** 页码：分数式竖排（当前页 / 总页数）；有目录时悬停显示目录内位置 */
function PageIndicator() {
  const position = useSelector((s) => documentPosition(s.documents), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const title = position.group
    ? `${position.group} 第 ${position.groupPage}/${position.groupTotal} 页，共 ${position.total} 页`
    : `第 ${position.page}/${position.total} 页`;
  return (
    <div class="kb-stage__page" title={title} aria-label={title}>
      <span class="kb-stage__page-current">{position.page}</span>
      <span class="kb-stage__page-total">{position.total}</span>
    </div>
  );
}

/** 缩略图列：按目录分组，目录可折叠；切换页面时展开所在目录并滚动到可见位置 */
function Thumbnails({ width }: { width: number }) {
  const kernel = useKernel();
  const images = useSelector((s) => s.documents.items);
  const index = useSelector((s) => s.documents.index);
  const groups = groupDocuments(images);
  const grouped = groups.some((g) => g.name);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const list = useRef<HTMLDivElement>(null);
  const current = groups.find((g) => index >= g.start && index < g.start + g.items.length);

  useEffect(() => {
    if (current && folded[current.name]) setFolded((f) => ({ ...f, [current.name]: false }));
    list.current?.querySelector('.kb-stage__thumb.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }, [index, current?.name]);

  return (
    <div ref={list} class="kb-stage__thumbs kb-scroll" style={{ width: `${width}px` }} role="listbox" aria-label="缩略图">
      {groups.map((group) => {
        const isFolded = grouped && !!folded[group.name];
        return (
          <div key={`${group.start}:${group.name}`} class="kb-stage__group" role="group" aria-label={group.name || undefined}>
            {grouped && (
              <button
                type="button"
                class={cx('kb-stage__group-header', group === current && 'is-current')}
                aria-expanded={!isFolded}
                title={`${group.name || '未分组'}（${group.items.length} 页）`}
                onClick={() => setFolded((f) => ({ ...f, [group.name]: !isFolded }))}
              >
                <Icon name={isFolded ? 'chevron-right' : 'chevron-down'} />
                <span class="kb-stage__group-name">{group.name || '未分组'}</span>
                <span class="kb-stage__group-count">{group.items.length}</span>
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
                    class={cx('kb-stage__thumb', at === index && 'is-active')}
                    title={grouped ? `${group.name} 第 ${i + 1} 页（${item.name}）` : item.name}
                    onClick={() => kernel.dispatch(documentsActions.goto(at))}
                  >
                    <img src={item.thumbnail ?? item.src} alt="" loading="lazy" draggable={false} />
                    <span>{grouped ? i + 1 : at + 1}</span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
