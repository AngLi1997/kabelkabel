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
  const drag = useRef<{ x: number; y: number; px: number; py: number; button: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  // 右键拖动平移后抑制随后的 contextmenu，避免拖完弹出右键菜单
  const suppressMenu = useRef(false);
  const hovering = useRef(false);
  const [space, setSpace] = useState(false);
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

  // 空格按住状态：仅在指针位于舞台内或焦点在舞台内时生效，输入控件中的空格不受影响
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      const el = stage.current;
      if (!hovering.current && !(el && el.contains(globalThis.document.activeElement))) return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpace(false);
    };
    const release = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);

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
    interactive: false,
  };

  // 平移规则（全局鼠标对图片类操作的约定）：
  // - 无交互工具：左 / 中 / 右键拖动均平移（在冒泡阶段处理，覆盖层可 stopPropagation 自行接管）；
  // - 有交互工具：左键交给工具，空格 + 左键、中键拖动平移（在捕获阶段强制处理，工具收不到该事件）。
  const tool = view.tool;
  const startPan = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    // 阻止中键自动滚动
    if (event.button === 1) event.preventDefault();
    suppressMenu.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, button: event.button, moved: false };
    setPanning(true);
  };
  const onPointerDownCapture = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!image) return;
    if (event.button === 1 || (event.button === 0 && space)) {
      event.stopPropagation();
      startPan(event);
    }
  };
  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!image || tool || event.button > 2) return;
    startPan(event);
  };
  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
    setPan({ x: d.px + dx, y: d.py + dy });
  };
  const endDrag = () => {
    if (drag.current?.button === 2 && drag.current.moved) suppressMenu.current = true;
    drag.current = null;
    setPanning(false);
  };
  const onContextMenuCapture = (event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (!suppressMenu.current) return;
    suppressMenu.current = false;
    event.preventDefault();
    event.stopPropagation();
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
        style={{ cursor: image ? stageCursor(!!tool, tool?.cursor, space, panning) : undefined }}
        tabIndex={0}
        aria-label="影像区域"
        data-kb-context="stage"
        onPointerDownCapture={onPointerDownCapture}
        onPointerDown={onPointerDown}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        onContextMenuCapture={onContextMenuCapture}
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
            <div key={overlay.id} class={cx('kb-stage__overlay', !!overlay.tool && overlay.tool === tool?.id && 'is-interactive')}>
              <ViewHost view={overlay.view} props={{ ...overlayProps, image, interactive: !!overlay.tool && overlay.tool === tool?.id }} />
            </div>
          ))}
      </div>
    </div>
  );
}

/** 舞台光标：平移中 grabbing；工具激活且未按空格为工具光标；其余（含按住空格）为 grab */
function stageCursor(hasTool: boolean, toolCursor: string | undefined, space: boolean, panning: boolean) {
  if (panning) return 'grabbing';
  if (hasTool && !space) return toolCursor ?? 'crosshair';
  return 'grab';
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
