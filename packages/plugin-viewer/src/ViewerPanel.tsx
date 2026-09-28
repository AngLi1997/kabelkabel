import type { PanelViewProps } from '@kabel/core';
import { cx, Empty, IconButton, Resizer, useElementSize, useKernel, useSelector } from '@kabel/ui';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { currentScale, viewerActions } from './slice';

const STAGE_PADDING = 16;

export function ViewerPanel(_: PanelViewProps) {
  const kernel = useKernel();
  const viewer = useSelector((s) => s.viewer);
  const { images, index, rotation, thumbnails, thumbSize } = viewer;
  const image = images[index];
  const scale = currentScale(viewer);

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
    if (viewer.zoom === 'fit') setPan({ x: 0, y: 0 });
  }, [viewer.zoom, rotation]);

  // 适应窗口比例随容器尺寸、旋转角度变化
  useLayoutEffect(() => {
    if (!natural || !size.width || !size.height) return;
    const turned = rotation % 180 !== 0;
    const w = turned ? natural.h : natural.w;
    const h = turned ? natural.w : natural.h;
    const fit = Math.min((size.width - STAGE_PADDING * 2) / w, (size.height - STAGE_PADDING * 2) / h);
    if (fit > 0) kernel.dispatch(viewerActions.setFitScale(fit));
  }, [natural, size.width, size.height, rotation]);

  // 滚轮缩放（非被动监听，才能阻止页面滚动）
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!image) return;
      event.preventDefault();
      kernel.dispatch(viewerActions.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [kernel, image]);

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !image) return;
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
      ArrowLeft: 'viewer.prev',
      ArrowRight: 'viewer.next',
      PageUp: 'viewer.prev',
      PageDown: 'viewer.next',
      '+': 'viewer.zoomIn',
      '=': 'viewer.zoomIn',
      '-': 'viewer.zoomOut',
      '0': 'viewer.fit',
    };
    const command = map[event.key];
    if (!command || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    void kernel.execute(command);
  };

  const run = (command: string) => () => void kernel.execute(command);
  const thumbStart = useRef(0);

  return (
    <div class="kb-viewer">
      <div
        ref={stage}
        class={cx('kb-viewer__stage', image && 'is-ready')}
        tabIndex={0}
        aria-label="影像区域"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDblClick={run(viewer.zoom === 'fit' ? 'viewer.actual' : 'viewer.fit')}
        onKeyDown={onKeyDown}
      >
        {!image && <Empty icon="image" text={viewer.loading ? '影像加载中' : '暂无影像'} />}
        {image && failed && <Empty icon="image" text="影像加载失败" />}
        {image && !failed && (
          <img
            key={image.src}
            ref={imgRef}
            class="kb-viewer__image"
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
      </div>

      {thumbnails && images.length > 1 && (
        <>
          <Resizer
            axis="y"
            label="调整缩略图高度"
            onStart={() => {
              thumbStart.current = thumbSize;
            }}
            onMove={(delta) => kernel.dispatch(viewerActions.setThumbSize(thumbStart.current - delta))}
            onReset={() => kernel.dispatch(viewerActions.setThumbSize(88))}
          />
          <div class="kb-viewer__thumbs kb-scroll" style={{ height: `${thumbSize}px` }} role="listbox" aria-label="缩略图">
            {images.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === index}
                class={cx('kb-viewer__thumb', i === index && 'is-active')}
                title={item.name}
                onClick={() => kernel.dispatch(viewerActions.goto(i))}
              >
                <img src={item.thumbnail} alt="" loading="lazy" draggable={false} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div class="kb-viewer__bar">
        <div class="kb-viewer__group">
          <IconButton icon="chevron-left" title="上一页" disabled={index <= 0} onClick={run('viewer.prev')} />
          <span class="kb-viewer__page">{images.length ? `${index + 1} / ${images.length}` : '0 / 0'}</span>
          <IconButton icon="chevron-right" title="下一页" disabled={index >= images.length - 1} onClick={run('viewer.next')} />
        </div>
        <div class="kb-viewer__group">
          <IconButton icon="zoom-out" title="缩小" disabled={!image} onClick={run('viewer.zoomOut')} />
          <span class="kb-viewer__zoom">{Math.round(scale * 100)}%</span>
          <IconButton icon="zoom-in" title="放大" disabled={!image} onClick={run('viewer.zoomIn')} />
          <IconButton icon="fit" title="适应窗口" active={viewer.zoom === 'fit'} disabled={!image} onClick={run('viewer.fit')} />
          <IconButton icon="actual-size" title="原始大小" disabled={!image} onClick={run('viewer.actual')} />
          <IconButton icon="rotate-left" title="向左旋转" disabled={!image} onClick={run('viewer.rotateLeft')} />
          <IconButton icon="rotate-right" title="向右旋转" disabled={!image} onClick={run('viewer.rotateRight')} />
          <IconButton icon="grid" title="缩略图" active={thumbnails} disabled={images.length < 2} onClick={run('viewer.toggleThumbnails')} />
        </div>
      </div>
    </div>
  );
}

