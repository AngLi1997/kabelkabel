# @kabel/plugin-workspace · 工作台

工作台插件（插件名 `kabel:workspace`）是**所有业务插件的底座**：它定义“当前打开了哪些文件、正在看哪一个、内容怎么展示、插件往哪里叠加内容”。著录、标注、OCR、页面管理等业务插件都只依赖它，不依赖彼此的实现，也不关心具体渲染细节。

baseline **内置**（`builtin`：不可停用，不在插件管理中显示）。

## 它提供什么

| 层 | 内容 | 业务插件怎么用 |
| --- | --- | --- |
| **文档模型** | `state.documents = { items, index, loading }`：当前打开的文件列表与当前文件；事件 `document:change` | 读当前文件、监听切换、替换文件列表 |
| **文件目录 + 内容面板** | 左侧 `workspace.files`（按 `group` 分组、可折叠、点击切换）、中间 `workspace.content`（按文件类型选渲染器） | 通常无需改动；需要时同 id 贡献即可整体替换 |
| **渲染器** | 扩展点 `WorkspaceExtensions.renderers`，内置 `workspace.image`（影像） | 贡献新的渲染器接入 PDF、OFD 等文件类型 |
| **影像舞台** | `state.stage`（缩放、旋转、适应窗口比例）+ 坐标系；扩展点 `WorkspaceExtensions.overlays`（覆盖层）与 `tools`（侧边工具条） | 在影像上叠加标注、选区、水印，并提供图片像素 ↔ 舞台坐标的换算 |
| **服务与 hooks** | `WORKSPACE_SERVICE`、`useDocuments()` / `useCurrentDocument()` / `useStage()` | 业务插件的统一入口 |
| **图片来源解析** | URL、`data:` / `blob:`、纯 base64（自动识别 MIME）、Blob / File、ArrayBuffer、对象、异步加载器；object URL 自动释放；并发 `setImages` 以最后一次为准 | 宿主调用 `setImages` |

## 业务插件如何接入

```ts
import { definePlugin } from '@kabel/core';
import { WORKSPACE_PLUGIN, WORKSPACE_SERVICE, WorkspaceExtensions, useCurrentDocument, type StageOverlayProps } from '@kabel/plugin-workspace';

export const marksPlugin = () =>
  definePlugin({
    name: 'acme:marks',
    dependencies: [WORKSPACE_PLUGIN],                       // 只依赖工作台
    setup(ctx) {
      const workspace = ctx.services.get(WORKSPACE_SERVICE);
      ctx.on('document:change', ({ document }) => load(document?.id));
      ctx.contribute(WorkspaceExtensions.overlays, { id: 'acme.marks', view: MarksOverlay });
      ctx.contribute(WorkspaceExtensions.tools, { id: 'acme.draw', icon: 'box', tooltip: '框选', command: 'acme.draw' });
      ctx.contribute(ExtensionPoints.panels, { id: 'acme.list', region: 'right', title: '标记', view: MarkList });
    },
  });
```

约定：

- **只依赖 `kabel:workspace` 与它的服务 / 扩展点**，不要 import 其他业务插件，也不要读舞台以外的内部实现。
- 需要跟随当前文件时用 `document:change` 事件或 `useCurrentDocument()`，用文件的 `id` 作键保存自己的数据。
- 在影像上交互一律走覆盖层：`toScreen` / `toImage` 已考虑缩放、旋转、平移，不要自己算。
- 右键菜单区域标识：`document`（文件目录中的文件，`data` 为下标）、`stage`（影像舞台）。向这些区域贡献菜单项即可，无需改动本插件。
- 只读模式下，修改内容的命令声明 `mutates: true`。

## 替换内置 UI

文件目录、内容面板、影像渲染器都是普通贡献项，用**相同 id** 贡献即可替换（释放后自动恢复内置版本）：

```ts
ctx.contribute(ExtensionPoints.panels, { id: 'workspace.files', region: 'left', title: '案卷', view: MyTree });     // 换成自己的目录
ctx.contribute(WorkspaceExtensions.renderers, { id: 'workspace.image', match: (d) => d.kind === 'image', view: MyImageView });
```

也可以不换 id：`directory: false` 不注册内置目录、`directory: { region: 'right' }` 移到右侧，或新增 `order` 更小的渲染器抢先匹配。

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
  workspace: { thumbnails: false, directory: { title: '文件目录' } },
});
await editor.setImages(next);                                      // 替换影像
editor.setDocuments([{ id: 'x', name: 'x.pdf', kind: 'pdf', src: '/x.pdf' }]);   // 非图片：需有对应渲染器
```

单独组合：`createKernel({ plugins: [layoutPlugin(), workspacePlugin({ images })] })`，并引入 `@kabel/plugin-workspace/style.css`。

## 配置 `WorkspacePluginOptions`

| 选项 | 说明 |
| --- | --- |
| `images` | 初始影像 `ImageSourceInput[]` |
| `items` | 初始文件（已解析的 `DocumentItem[]`，用于非图片或自行解析的来源） |
| `thumbnails` | 影像舞台内是否显示缩略图条，默认 `false`（用户切换后以持久化值为准） |
| `directory` | 文件目录面板 `title` / `region` / `order`（默认 `文件目录` / `left` / `10`），`false` 不注册 |
| `content` | 内容面板 `title` / `region` / `order`（默认 `内容` / `main` / `10`） |
| `urlFactory` | 自定义 object URL 的创建与释放（测试 / SSR） |

`DocumentItem`：`{ id, name, group?, kind, src, thumbnail?, mime? }`；影像对象输入：`{ id?, name?, group?, url? | src? | base64? | blob? | file? | data?, mime?, thumbnail? }`。

## 命令与按键

| 命令 | 说明 |
| --- | --- |
| `workspace.prev` / `workspace.next` / `workspace.goto(index)` | 切换当前文件 |
| `workspace.zoomIn` / `zoomOut` / `fit` / `actual` | 缩放（仅当前文件是影像时可用） |
| `workspace.rotateLeft` / `rotateRight` | 旋转 |
| `workspace.toggleThumbnails` | 缩略图开关 |

影像舞台获得焦点时：`←` `→` / `PageUp` `PageDown` 翻页，`+` `-` 缩放，`0` 适应窗口，双击在适应窗口与原始大小间切换，滚轮缩放。平移与工具的鼠标规则见下节。

## 舞台鼠标规则

这是所有“对图片的鼠标操作”的全局约定，**由工作台统一执行，插件不各自实现**：

| 状态 | 左键拖动 | 右键 | 空格 + 左键拖动 | 中键拖动 | 滚轮 |
| --- | --- | --- | --- | --- | --- |
| 没有交互工具 | 平移 | 平移（拖动后不弹右键菜单） | 平移 | 平移 | 缩放 |
| 有交互工具 | **交给工具** | **交给工具** | 平移 | 平移 | 缩放 |

- **交互工具**通过 `WORKSPACE_SERVICE.acquireTool(id, { cursor })` 租用舞台指针，同一时刻只有一个工具。新租约抢占旧租约，旧租约持有者会收到事件 `stage:tool-change`（`{ active, previous }`）并应自行退出。返回的 `Disposable` 用于归还，插件应 `ctx.onDispose(lease)`。
- 覆盖层声明 `tool: '<工具 id>'` 后，**只有该工具正占用舞台时**才接收指针事件（`interactive` 为 true），平时仍不拦截。
- 空格 + 左键、中键在**捕获阶段**由工作台接管，工具收不到这些事件，所以工具内部的草稿（如画到一半的多边形）不会被平移打断；工具应把状态存成图片坐标。
- 光标由工作台统一给：工具激活时为工具光标（默认 `crosshair`），按住空格或平移中为 `grab` / `grabbing`。
- 没有租用工具、也没有声明 `tool` 的旧式覆盖层保持原行为：未 `stopPropagation` 的指针事件冒泡到舞台用于平移。

## 服务 `WORKSPACE_SERVICE`

```ts
const workspace = kernel.services.get(WORKSPACE_SERVICE);
await workspace.setImages(inputs);
workspace.setDocuments(items); workspace.getDocuments(); workspace.getImages();
workspace.current(); workspace.goto(2); workspace.getStage();
const lease = workspace.acquireTool('acme:draw', { cursor: 'crosshair' });   // 租用舞台指针
lease.dispose();                                                              // 归还
```

## 事件与状态

- 事件 `document:change`：`{ index, document }`；`stage:tool-change`：`{ active, previous }`（舞台交互工具被占用、归还或被抢占，`@mode emit`）。
- 切片 `documents`：`items, index, loading`；切片 `stage`：`zoom, fitScale, rotation, thumbnails, thumbSize, tool`（`tool` 为当前交互工具 `{ id, cursor? }`，不持久化）。均不纳入撤销。切换文件时舞台自动恢复适应窗口与不旋转。
- 辅助函数：`groupDocuments(items)`、`documentPosition(state)`。

## 扩展点 `WorkspaceExtensions`

```ts
// 渲染器：内容面板按文件 kind 选择第一个 match 的渲染器（order 升序）
ctx.contribute(WorkspaceExtensions.renderers, { id: 'pdf.renderer', match: (d) => d.kind === 'pdf', view: PdfView });

// 覆盖层：铺满影像舞台，默认不拦截指针事件；声明 tool 后，仅当该工具占用舞台时才接收指针
ctx.contribute(WorkspaceExtensions.overlays, { id: 'acme.marks', tool: 'acme:draw', view: MarksOverlay });

function MarksOverlay({ image, width, height, scale, rotation, toScreen, toImage, interactive }: StageOverlayProps) {
  const p = toScreen(100, 200);   // 图片像素坐标 → 舞台坐标
  return <div style={{ position: 'absolute', left: p.x, top: p.y }} />;
}

// 侧边工具条按钮：选中态取命令的 checked
ctx.contribute(WorkspaceExtensions.tools, { id: 'acme.tool', icon: 'box', tooltip: '工具', command: 'acme.tool', order: 10 });
```

## 样式

`@kabel/plugin-workspace/style.css`（已包含在 `@kabel/editor/style.css` 中）。类名前缀 `kb-stage`（影像舞台）、`kb-files`（文件目录）。
