# @kabel/plugin-viewer · 影像查看

影像查看插件（插件名 `kabel:viewer`），baseline **内置**（`builtin`：不可停用，不在插件管理中显示）。影像显示在工作台中间区域并撑满高度，侧边为竖排工具条与缩略图列。

## 功能

- **多种影像源**：URL、`data:` / `blob:` URL、纯 base64（自动识别 MIME）、Blob / File、ArrayBuffer / Uint8Array、对象、异步加载器；为 Blob / 二进制创建的 object URL 在替换或卸载时自动释放；并发 `setImages` 以最后一次为准。
- **查看**：适应窗口 / 原始大小、滚轮缩放、拖动平移（左键或中键）、左右旋转、双击切换适应窗口与原始大小。
- **侧边工具条**：翻页 + 分数式页码（当前页 / 总页数）、缩放、旋转、缩略图开关；其他插件可贡献按钮。
- **缩略图列**：可拖拽调整宽度；影像带 `group`（目录）时按目录分组、可折叠，编号为目录内页码，切换页面时自动展开并滚动到当前页。
- **扩展点**：覆盖层（在影像上绘制交互内容，提供坐标换算）与工具条按钮。`@kabel/plugin-annotation` 基于它们实现。

## 集成

baseline 默认包含，传入 `images` 即可：

```ts
createArchiveEditor('#app', {
  images: [
    { url: '/scans/0001.jpg', group: '正文' },
    { base64: raw, name: '0002.jpg', group: '正文' },
    { blob: file, group: '附件' },
    async () => ({ blob: await (await fetch(url, { headers })).blob(), group: '处理单' }),
  ],
  viewer: { thumbnails: true },
});
await editor.setImages(next);   // 替换影像
```

单独组合：`createKernel({ plugins: [layoutPlugin(), viewerPlugin({ images })] })`，并引入 `@kabel/plugin-viewer/style.css`。

## 配置 `ViewerPluginOptions`

| 选项 | 说明 |
| --- | --- |
| `images` | 初始影像 `ImageSourceInput[]` |
| `thumbnails` | 默认是否显示缩略图（用户切换后以持久化值为准） |
| `panel` | 覆盖面板 `title` / `region` / `order`（默认 `原文影像` / `main` / `10`） |
| `urlFactory` | 自定义 object URL 的创建与释放（测试 / SSR） |

影像对象：`{ id?, name?, group?, url? | src? | base64? | blob? | file? | data?, mime?, thumbnail? }`。

## 命令与按键

| 命令 | 说明 |
| --- | --- |
| `viewer.prev` / `viewer.next` / `viewer.goto(index)` | 翻页 |
| `viewer.zoomIn` / `viewer.zoomOut` / `viewer.fit` / `viewer.actual` | 缩放 |
| `viewer.rotateLeft` / `viewer.rotateRight` | 旋转 |
| `viewer.toggleThumbnails` | 缩略图开关 |

影像区域获得焦点时：`←` `→` / `PageUp` `PageDown` 翻页，`+` `-` 缩放，`0` 适应窗口。

## 服务 `VIEWER_SERVICE`

```ts
const viewer = kernel.services.get(VIEWER_SERVICE);
await viewer.setImages(inputs);
viewer.getImages(); viewer.current(); viewer.goto(2);
```

## 事件与状态

- 事件 `viewer:change`：`{ index, image }`。
- 切片 `viewer`（不纳入撤销）：`images, index, zoom, fitScale, rotation, thumbnails, thumbSize, loading`。
- 辅助函数：`groupImages(images)` 按目录分段，`pagePosition(state)` 计算目录内页码。

## 扩展点 `ViewerExtensions`

```ts
import { ViewerExtensions, type ViewerOverlayProps } from '@kabel/plugin-viewer';

// 覆盖层：铺满影像舞台，默认不拦截指针事件；未 stopPropagation 的指针事件会冒泡到舞台用于平移
ctx.contribute(ViewerExtensions.overlays, { id: 'acme.marks', view: MarksOverlay });

function MarksOverlay({ image, width, height, scale, rotation, toScreen, toImage }: ViewerOverlayProps) {
  const p = toScreen(100, 200);   // 图片像素坐标 → 舞台坐标（已考虑缩放、旋转、平移）
  return <div style={{ position: 'absolute', left: p.x, top: p.y }} />;
}

// 侧边工具条按钮：选中态取命令的 checked
ctx.contribute(ViewerExtensions.tools, { id: 'acme.tool', icon: 'box', tooltip: '工具', command: 'acme.tool', order: 10 });
```

## 样式

`@kabel/plugin-viewer/style.css`（已包含在 `@kabel/editor/style.css` 中）。
