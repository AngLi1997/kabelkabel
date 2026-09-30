# @kabel/plugin-region-select · 框选

在影像舞台上框选区域（内置矩形、多边形，形状可扩展），完成后触发事件，把**原始图片、裁剪图（Blob）、bbox、形状**交给下游。插件本身不保存、不识别，结果怎么用由下游业务代码决定；其他插件也可以通过服务直接取得裁剪版图像。

插件名 `kabel:region-select`，只依赖 `kabel:workspace`。

## 集成

```ts
import { regionSelectPlugin } from '@kabel/plugin-region-select';

createArchiveEditor(el, { images, plugins: [regionSelectPlugin()] });
// 样式已包含在 @kabel/editor/style.css 中
```

装上后影像工具条出现“矩形框选”“多边形框选”两个按钮，点击激活，再点一次退出。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `minSize` | `4` | 小于该尺寸（图片像素）的选区视为误触 |
| `autoExit` | `true` | 框选完成后自动退出工具；`false` 可连续框选 |
| `shapes` | `['rect', 'polygon']` | 启用的内置形状 |
| `crop` | `{}` | 默认裁剪参数：`mime`（默认 `image/png`）、`quality`、`background` |
| `panel` | 右侧“框选结果” | 面板 `{ region, title, order, limit }`（`limit` 默认 20）；`false` 不注册 |

## 框选结果面板

插件自带右侧面板“框选结果”，列出最近的**用户框选**（`origin === 'user'`）的裁剪图，可下载、移除、清空；`pick()` 的结果由请求方处理，不进面板。面板是插件的贡献项，插件停用或卸载时随之消失。它只是内存中的展示列表（object URL 在移除、清空、卸载时释放），不是结果存储，下游仍应订阅 `region:select`。

## 交互

遵循工作台的舞台鼠标规则：工具激活时**左键绘制**，**空格 + 左键**（或中键）拖动平移，滚轮缩放。

| 形状 | 操作 |
| --- | --- |
| 矩形 | 按下拖动、松开完成；**Shift + 左键拖动**约束为正方形 |
| 多边形 | 逐点单击；双击、`Enter` 或单击起点闭合；右键或 `Backspace` 撤销上一个顶点；自交或过小的多边形会被拒绝并提示，草稿保留 |

`Esc`：先丢弃草稿，再按一次退出工具。切换文件时草稿自动丢弃。

## 事件（下游订阅这些）

```ts
ctx.on('region:select', async (e) => {          // 或 editor.on('region:select', ...)
  if (e.origin !== 'user' || !e.crop) return;    // 只处理用户手动框选
  save(e.crop.blob, e.bbox);                     // 保存 / OCR / 加入自己的列表
});
```

| 事件 | 模式 | 载荷 | 说明 |
| --- | --- | --- | --- |
| `region:before-select` | `emitAsync` | `{ origin, document, shape, bbox }` | 提交前校验，处理器 reject 即否决 |
| `region:select` | `emit` | `RegionSelection` | 裁剪完成，结果直接带 Blob |
| `region:change` | `emit` | `{ draft }` | 绘制中的草稿，`null` 表示清除 |
| `region:cancel` | `emit` | `{ origin, reason, error? }` | `cancel` / `preempted`（被其他工具抢占）/ `rejected`（被 before-select 否决） |
| `region:error` | `emit` | `{ origin, error }` | 解码或裁剪失败；同时给用户 error 提示，不会触发 `region:select` |

`RegionSelection`：

| 字段 | 说明 |
| --- | --- |
| `id` / `origin` | 选区 id；发起者，用户操作为 `user`，`pick()` 为请求方传入的名字 |
| `document` / `image` | 当前文件 / 原始图片项（`src`、`name` 等） |
| `original` | 原始图片的 `Blob` |
| `shape` | 形状，**图片像素坐标**：`{ type: 'rect', x, y, width, height }` 或 `{ type: 'polygon', points }` |
| `bbox` | 外接矩形（图片像素，已向外取整并限制在图片内） |
| `crop` | `{ blob, mime, width, height, bbox, localShape }`；无面积的形状为 `null`。多边形按形状裁剪，形状外透明（默认 PNG）；`localShape` 是相对裁剪图左上角的形状，便于继续标注 |

坐标与舞台缩放、旋转无关，裁剪永远从原图裁。插件不保留 Blob，也不创建 object URL，谁要显示谁自己 `URL.createObjectURL`。

## 服务 `REGION_SERVICE`

供其他插件使用；未必存在时用 `ctx.services.tryGet`，**在使用时取，不要在 `setup` 里缓存**（服务没有变更通知）。必须依赖框选才能工作的插件，再声明 `dependencies: ['kabel:region-select']`。

```ts
const region = ctx.services.tryGet(REGION_SERVICE);

// 让用户框一个，再拿结果（一次性；取消、被抢占返回 null）
const sel = await region?.pick({ origin: 'acme:ocr', shape: 'rect' });
if (sel?.crop) recognize(sel.crop.blob);

// 无 UI 裁剪：给已有的形状取裁剪图（如标注插件里的某个框）
const crop = await region?.crop(image, { type: 'rect', x: 10, y: 20, width: 100, height: 60 }, { mime: 'image/jpeg' });
```

`origin` 用来避免事件串台：`pick()` 发起的选区同样会广播 `region:select`，但带着请求方的名字，保存类插件只处理 `origin === 'user'`。

其余方法：`activeShape()`、`activate(type)`、`deactivate()`。

下游只需要 `contract`（令牌、类型、事件），都从包入口导出；不必依赖绘制与裁剪的实现。

## 命令

| 命令 | 快捷键 | 说明 |
| --- | --- | --- |
| `regionSelect.tool.rect` / `regionSelect.tool.polygon` | — | 切换对应形状（`checked` 表示当前激活） |
| `regionSelect.cancel` | `Esc` | 取消 |
| `regionSelect.confirm` | `Enter` | 完成（多边形） |
| `regionSelect.undo` | `Backspace` | 撤销上一步（多边形顶点） |

快捷键可在 设置 › 快捷键 中改绑。框选不修改内容，因此只读模式下也可使用。

## 扩展：新增形状

形状是扩展点 `RegionExtensions.shapes` 的贡献项。圆形、点位、线条等以后只需要新增一份形状定义，**覆盖层、事件、裁剪流程都不用改**。

```ts
declare module '@kabel/plugin-region-select' {
  interface RegionShapeMap { circle: { cx: number; cy: number; r: number } }
}

definePlugin({
  name: 'acme:circle',
  dependencies: ['kabel:region-select'],
  setup(ctx) {
    contributeShape(ctx, {
      type: 'circle', title: '圆形框选', icon: 'circle',
      createTool: (host) => new CircleTool(host),   // 状态机：down / move / up / reset…，坐标为图片像素
      bbox: (s) => ({ x: s.cx - s.r, y: s.cy - s.r, width: 2 * s.r, height: 2 * s.r }),
      translate: (s, dx, dy) => ({ ...s, cx: s.cx - dx, cy: s.cy - dy }),
      crop: 'clip',
      clipPath: (s, path, o) => path.arc(s.cx - o.x, s.cy - o.y, s.r, 0, Math.PI * 2),
      render: (s, { toScreen, scale }) => <circle …/>,
    });
  },
});
```

`contributeShape` 一次完成：注册形状、生成命令 `regionSelect.tool.<type>`、在舞台工具条加按钮，并挂在调用方插件上，卸载时释放。`crop: false` 表示没有面积（点位、线条），`crop` 为 `null`，只返回形状。同 `type` 贡献即替换内置形状。

## 替换裁剪器 `REGION_CROPPER`

默认裁剪器用 `fetch` 取原图、`createImageBitmap` 解码（SVG 等不支持的格式回退到 `<img>`）、canvas 裁剪，并按 `src` 缓存最近几张。宿主可以提供同令牌的服务来替换，例如服务端裁剪或 WASM 解码大尺寸 TIFF（服务是覆盖栈，后提供者生效）：

```ts
kernel.services.provide(REGION_CROPPER, { original: async (image) => …, crop: async (request) => … });
```

跨域图片需要服务端允许 CORS，否则 `fetch` 失败，转为 `region:error`。

## 状态

切片 `regionSelect`：`tool`（当前形状）、`draft`（草稿）、`busy`（裁剪中）、`last`（最近一次的 `{ id, documentId, shape, bbox }`，不含图片数据）。不纳入撤销。

## 样式

已包含在 `@kabel/editor/style.css` 中。类名前缀 `kb-rsel`。
