# 档案业务插件拆解设计（著录 · 摘录 · 加工 · 标注）

> 状态：部分已实现（见文末“实现进度”）。本文基于当前底座（`core` / `ui` / `plugin-workspace` / `plugin-region-select` / `plugin-file-loader`）的实现，对照四类现有系统界面（案卷著录、市场监管加工、文书著录 + AI 提取、影像标注），给出插件拆分、契约与联动方式，以及底座需要补齐的能力。
>
> 设计前置参考：dsh（deepseek-harness）“一切皆插件”——功能 = 插件组合，预设只是插件清单；cordis 的 Context / Service / Plugin 模型——服务是有生命周期的依赖，插件声明依赖的服务，作用域（fork）随上下文释放。

## 1. 现状评估

### 1.1 已经做对的部分

| 机制 | 现状 | 对档案业务的价值 |
| --- | --- | --- |
| 微内核 + `ctx` 自动释放 | 所有注册挂在插件 `DisposableStore` 上，`unuse` / `disable` 逆序释放 | 业务插件可按场景启停，不留残留 |
| 服务令牌覆盖栈 | `provide` 后注册者生效、释放后恢复 | 识别引擎、裁剪器、存储后端可由宿主替换（如 `REGION_CROPPER`） |
| 扩展点 + 同 id 替换 | 工具栏 / 状态栏 / 面板 / 设置 / 右键菜单 / 渲染器 / 覆盖层 / 工具条 | 界面完全由贡献项拼装，换场景不改底座 |
| 可否决事件 `emitAsync` | `save`、`region:before-select` | 提交前校验、离开前确认等流程天然可插拔 |
| 舞台工具租约 | `acquireTool` 单租约 + `stage:tool-change` 抢占广播 | 框选 / 脱敏 / 标注 / 测量互斥，插件互不知道对方 |
| 能力插件范式 | `region-select`：契约（`contract.ts`）与实现分离，`pick()` 以 `origin` 区分请求方 | 摘录、脱敏、问题标记都可复用同一套框选 |
| 保存契约 / 只读 / 撤销 | `kabel.save`、`mutates`、`history: true` 切片 | 著录数据的撤销、草稿、只读审阅直接可用 |

### 1.2 与档案业务的差距

对照四张截图，当前底座缺的是**档案领域层**，而不是渲染能力：

1. **只有“文件”，没有“档案实体”**。`state.documents` 是扁平文件列表（`group` 仅用于目录分组）。业务上需要 任务/清单 → 案卷 → 卷内件 → 页（材料项）的层级、“下一个清单 / 下一件 / 跳过”、扫封皮二维码定位、页号调整、件的拆分合并。这些如果各业务插件自己维护，会出现多份“当前档案”。
2. **没有共享的“字段数据”契约**。截图 3 中 AI 提取写字段、框选摘录写字段、“抄上一件”写字段、校验读字段、影像上的“题名”框与字段互相定位——五个功能围绕同一份字段值协作。若字段值由“著录插件”私有，其余插件只能 import 著录插件，违背“业务插件之间不 import”。
3. **区域标记没有统一模型**。框选只产出一次性事件（`region:select`），标注（截图 4 的“指纹”框）、脱敏（截图 2 的个人信息 / 商业秘密）、字段证据框（截图 3 的“题名”框）、问题标记都需要“持久化的、按页归属、带类别的区域”，而且都要画在舞台上。
4. **页面没有元数据与版本**。截图 1 缩略图上的“封皮”角标、截图 3 的“成品图 / 采集原图”“影像 V1”、截图 2 的深字 / 去黑 / 纠偏处理结果，都需要 `DocumentItem` 承载页面属性与影像版本。
5. **内核层面的依赖表达偏弱**（对照 cordis）：
   - 只有 `dependencies`（插件名，必须存在），没有**可选依赖**；可选能力靠 `services.tryGet` 在使用时取，服务出现 / 消失没有通知（region-select README 明确要求“不要缓存”）。
   - 没有**作用域**：切换案卷时，“只对当前案卷有效”的注册（如 AI 提取的待复核标记、该卷专用的校验规则）需要插件手工清理。
   - 插件配置没有 schema，设置页只能逐个手写。

结论：底座骨架（内核 + 工作台 + 舞台）方向正确，需要在工作台与业务插件之间补一层**能力契约**，并让内核支持可选服务依赖与作用域。

## 2. 分层与依赖规则

```
L4  场景预设   案卷著录 / 文书著录 / 加工 / 标注 …       createXxxPreset({ schema, layout, plugins })
     │  只做组合与配置，不写业务逻辑
L3  业务插件   著录 · 摘录 · AI 提取 · 加工处理 · 脱敏 · 标注 · 质检问题 · 提交流程
     │  只依赖 L1 / L2 的契约；L3 之间禁止 import、禁止 dependencies 互指
L2  能力插件   档案上下文 · 字段模型 · 区域标记 · 框选 · 识别引擎 · 影像处理
     │  每个能力 = contract（令牌 / 类型 / 事件 / 扩展点）+ 默认实现；实现可被宿主替换
L1  工作台     文档模型 · 渲染器 · 影像舞台 · 舞台工具租约           （builtin）
L0  内核/ui    Kernel · Store · History · Commands · Services · Extensions · Workbench
```

规则（建议写入 `CLAUDE.md`，替换“业务插件只依赖 `kabel:workspace`”）：

- **L3 只依赖 L1 与 L2 的契约**。L3 之间的联动一律通过 L2 的共享状态 / 服务 / 事件完成，例如“框选摘录 → 写字段”走字段模型服务，而不是调用著录插件。
- **L2 契约与实现分包或分文件**（沿用 `region-select/src/contract.ts` 写法），下游只 import 契约；实现通过服务令牌提供，宿主可覆盖（服务覆盖栈）。
- **硬依赖写 `dependencies`，软依赖用可选注入**（见 §5.1）。例如摘录插件硬依赖框选与字段模型，对识别引擎是软依赖：没有引擎时按钮置灰而不是插件加载失败。
- **L4 预设只是插件清单 + 配置**，与 `createBaselinePreset` 同构，宿主可以增删其中任意插件。

## 3. L2 能力插件

### 3.1 档案上下文 `@kabel/plugin-archive`（`kabel:archive`）

回答“正在处理哪份档案、它有哪些页”。是唯一维护档案层级的地方，工作台的文档列表由它驱动。

| 契约 | 内容 |
| --- | --- |
| 状态 `state.archive` | `{ task, tree: RecordNode[], currentId, loading, lock }`；`RecordNode = { id, type: 'volume' \| 'item' \| string, title, code?, status?, children?, pages: PageRef[] }`；`PageRef = { documentId, pageNo?, label?, material? }`（截图 2 的“材料项”、截图 1 的“封皮”即 `material` / `label`） |
| 服务 `ARCHIVE_SERVICE` | `load(task)`、`open(recordId)`、`current()`、`next()` / `prev()`（下一个清单 / 下一件）、`locate(code)`（扫码定位）、`updatePages(recordId, pages)`（页号调整、拆件 / 合件）、`setStatus(recordId, status)` |
| 数据源 `ARCHIVE_SOURCE`（宿主提供） | `fetchTask` / `fetchRecord` / `fetchPages` / `lock` / `unlock`。插件只管流程，接口由宿主实现，与 `save` 契约思路一致 |
| 事件 | `record:before-leave`（`emitAsync`，可否决：未保存、校验未过、提交中）、`record:change`、`record:status` |
| 命令 | `archive.next`、`archive.prev`、`archive.skip`、`archive.locate`、`archive.refresh`（刷新目录） |
| 贡献 | 左侧“案卷 / 件”树面板（截图 3 左栏 `JJ-000074`），工具栏定位输入框（`view` 型工具栏项），状态栏“第 1/1 件 · 本人占用” |

与工作台的关系：`open(recordId)` 先 `emitAsync('record:before-leave')`，通过后取页面 → `WORKSPACE_SERVICE.setDocuments(pages)` → 派发 `record:change`。工作台仍然只知道“当前打开的文件”，不感知案卷；没有装档案上下文时（如单纯看图）工作台照常工作。

### 3.2 字段模型 `@kabel/plugin-fields`（`kabel:fields`）

所有“往字段里写值”的插件的汇合点。著录面板只是它的一个视图。

```ts
interface FieldSchema {
  key: string; label: string; type: string;            // text / date / number / enum / multi / textarea / …
  required?: boolean; options?: Option[]; pattern?: string;
  group?: string; order?: number; no?: number;          // 截图 1 的字段序号
  copyable?: boolean;                                    // 参与“抄上一件”
  scope?: 'volume' | 'item';                             // 属于案卷目录还是卷内目录
}

interface FieldValue {
  value: unknown;
  source: 'user' | 'ai' | 'region' | 'copy' | 'host' | string;   // 值从哪来
  review?: 'pending' | 'confirmed';                               // AI 已填入 · 待复核 / 已确认
  confidence?: number;
  evidence?: { documentId: string; shape: RegionShape; text?: string };  // 影像证据
}
```

| 契约 | 内容 |
| --- | --- |
| 状态 `state.fields` | `{ schema: Record<scope, FieldSchema[]>, values: Record<recordId, Record<key, FieldValue>>, focus: { recordId, key } \| null, errors }`；**`history: true`**，字段修改可撤销，`meta.history.coalesce = recordId:key` 让连续输入合并为一条 |
| 服务 `FIELDS_SERVICE` | `setSchema`、`get(key)`、`set(key, value, { source, evidence, review })`、`confirm(key)`、`focus(key)`、`validate(scope?) → errors`、`copyFrom(recordId, keys?)` |
| 扩展点 | `FieldExtensions.types`（字段类型 → 编辑器视图，宿主可贡献 Vue 组件）、`validators`（跨字段规则，如起止时间先后）、`decorators`（字段下方的附加区：AI 来源标签、“确认”按钮、证据链接）、`sections`（分组折叠，截图 2 的“主体信息 / 事项信息”） |
| 事件 | `field:change { recordId, key, value, prev }`、`field:focus`、`field:validate` |
| 命令 | `fields.next` / `fields.prev`（Enter、Ctrl+↓/↑ 字段跳转）、`fields.confirmAll`、`fields.copyPrevious`（抄上一件，`mutates`）、`fields.focus`（hidden，带参数） |

关键点：**值的“来源”是一等数据**。AI 提取、框选摘录、抄上一件、人工输入都调用同一个 `set`，只是 `source` 不同；“待复核 2”“AI 已填入”“必填 7/9”都是对 `state.fields` 的派生，任何插件都能算，不需要知道是谁写的。

校验与流程的衔接：字段模型自己监听 `save`（存草稿）和 `record:before-leave`（有错误时询问），提交流程（§4.6）调用 `validate()`。

### 3.3 区域标记 `@kabel/plugin-marks`（`kabel:marks`）

持久化、按页归属、分图层的区域集合，加一个统一覆盖层。

```ts
interface Mark {
  id: string; documentId: string; layer: string;       // 'annotation' | 'redaction' | 'evidence' | 'issue' | …
  shape: RegionShape; label?: string; category?: string; order?: number;
  data?: unknown;                                         // 图层私有数据（如问题描述、关联字段 key）
}
```

| 契约 | 内容 |
| --- | --- |
| 状态 `state.marks` | `{ items: Record<documentId, Mark[]>, selected, hidden: string[] }`；`history: true` |
| 服务 `MARKS_SERVICE` | `add` / `update` / `remove` / `list({ layer, documentId })` / `select` / `setLayerVisible` |
| 扩展点 `MarkExtensions.layers` | `{ id, title, style(mark), order, editable, onActivate?(mark) }`：图层决定颜色、标签、是否可拖改、点击行为 |
| 覆盖层 | 一个 `WorkspaceExtensions.overlays` 贡献，按图层绘制当前页的所有标记；编辑（拖动顶点、移动）时租用舞台工具 `kabel:marks` |
| 事件 | `mark:add` / `mark:change` / `mark:remove` / `mark:activate` |

框选（`region-select`）保持“画一次、给结果”的职责不变；需要持久化的插件拿到 `RegionSelection` 后写入 `marks`。于是：

| 业务 | 图层 | 怎么来 | 点击行为 |
| --- | --- | --- | --- |
| 影像标注（截图 4 指纹框） | `annotation` | 选中标签后框选 | 选中标注、右侧列表高亮 |
| 脱敏（截图 2 个人信息 / 商业秘密） | `redaction` | 进入脱敏模式后框选 | 编辑类别；渲染为遮罩 |
| 字段证据（截图 3 “题名”框） | `evidence` | 摘录 / AI 提取写字段时附带 | `FIELDS_SERVICE.focus(key)` |
| 质检问题 | `issue` | 记录问题时可选框选位置 | 打开问题详情 |

### 3.4 识别引擎 `OCR_SERVICE` / `EXTRACT_SERVICE`（契约包 + 宿主实现）

只定义契约，不带实现（引擎在服务端）：

```ts
interface OcrService { recognize(image: Blob, options?: { lang?: string; hint?: string }): Promise<{ text: string; blocks?: OcrBlock[] }>; }
interface ExtractService { extract(req: { recordId: string; pages: PageRef[]; schema: FieldSchema[] }): Promise<ExtractedField[]>; }
// ExtractedField = { key, value, confidence, evidence? }
```

宿主 `kernel.services.provide(OCR_SERVICE, …)`；摘录和 AI 提取插件对它们是**软依赖**：没有提供时相关命令 `enabled` 为 false，横幅显示“智能算法未接入”。

### 3.5 影像处理 `@kabel/plugin-image-process`

截图 2 的左倾 / 右倾 / 裁剪 / 深字 / 浅字 / 去边 / 去黑，截图 4 的“图片调整 / 背景颜色”，截图 3 的“成品图 / 采集原图”。分两类：

- **显示调整（非破坏）**：亮度、对比度、反色、背景色 → 只改舞台渲染。需要工作台开放 `state.stage.filter`（或扩展点 `WorkspaceExtensions.imageFilters`），见 §5.3。
- **成品处理（产生新版本）**：纠偏、去边、去黑、深字等 → 调用宿主提供的 `IMAGE_PROCESSOR`（服务端 / WASM），结果作为页面的新**版本**（`variant`），通过档案上下文写回页面，可在“原图 / 成品图”间切换；处理记录进入撤销栈（撤销即切回上一版本引用）。

## 4. L3 业务插件

每个业务插件都很薄：它只把 L2 能力组合成一个工作流，并贡献界面。

### 4.1 著录 `@kabel/plugin-catalog`

- 依赖：`kabel:archive`、`kabel:fields`。
- 贡献：著录面板（默认右侧；截图 2 放在左侧只是预设里的 `region` 配置），按 `scope` 切成“案卷目录 / 卷内目录（0）”标签；“新增卷内目录”命令调用 `ARCHIVE_SERVICE` 新增 `item` 节点；字段视图来自 `FieldExtensions.types`。
- 不负责：AI、摘录、校验规则、提交——这些都是别的插件对同一字段模型的贡献。著录插件被停用，AI 提取写入的值仍在字段模型里，换一个面板插件即可显示。

### 4.2 框选摘录 `@kabel/plugin-excerpt`

截图 2 的“OCR 框选（Ctrl+O）”、截图 3 题名框的来源。

```
fields.focus(题名) ─► Ctrl+O ─► REGION_SERVICE.pick({ origin: 'excerpt' })
   ─► OCR_SERVICE.recognize(crop.blob) ─► FIELDS_SERVICE.set('title', text, { source: 'region', evidence: { documentId, shape } })
   ─► MARKS_SERVICE.add({ layer: 'evidence', data: { key: 'title' } })
```

- 依赖：`kabel:region-select`、`kabel:fields`；软依赖 `OCR_SERVICE`、`kabel:marks`（没有 marks 时只是不画证据框）。
- 用 `origin: 'excerpt'` 区分，框选结果不会进入“框选结果”面板，也不会被标注插件误收（region-select 已有的约定）。

### 4.3 AI 提取 `@kabel/plugin-ai-extract`

- 监听 `record:change`（或命令“重新提取”）→ `EXTRACT_SERVICE.extract` → 逐项 `FIELDS_SERVICE.set(key, v, { source: 'ai', review: 'pending', confidence, evidence })`。
- 不覆盖 `source: 'user'` 的值（人工优先），在字段 `decorators` 中贡献“AI 已填入 · 待复核 / 确认”与“AI：其他 采纳”候选。
- 状态栏 / 面板头：“AI 提取：已提取 6 项 · 待复核 2”；`record:before-leave` 时若仍有待复核项，按配置提示或否决。

### 4.4 加工处理 `@kabel/plugin-processing`

截图 2 的工具栏一整行：组合影像处理（§3.5）与页号调整。贡献“图像处理”工具栏分组、页号跳转 / 调整输入框、快捷键。页号调整调用 `ARCHIVE_SERVICE.updatePages`。

### 4.5 脱敏 `@kabel/plugin-redaction`

依赖 `kabel:region-select`、`kabel:marks`。贡献 `redaction` 图层（遮罩样式）、类别选择（个人信息 / 商业秘密）、“脱敏框选模式”命令；导出时可通过 `REGION_SERVICE.crop` / 裁剪器生成遮盖后的影像（或交由服务端）。

### 4.6 影像标注 `@kabel/plugin-annotation`

截图 4。依赖 `kabel:marks`、`kabel:region-select`。贡献标签体系（顶部“公文版头 / 指纹”标签条）、右侧“标签”列表、“显示顺序”开关（图层 `style` 中显示 `order`）、“清空”命令；“AI 标注”软依赖一个 `DETECT_SERVICE`。

### 4.7 质检问题 `@kabel/plugin-issues`

截图 1 的“问题清单”、截图 2 的“记录鉴定问题（Ctrl+I）”。问题 = `{ recordId, documentId?, fieldKey?, markId?, type, text, status }`；可挂在字段上（字段 `decorator` 显示红点）、挂在影像区域上（`issue` 图层）、或挂在整件上。只依赖档案上下文；字段与标记均为软依赖。

### 4.8 提交流程 `@kabel/plugin-workflow`

截图 1/2/3 底部或顶部的“确认 / 保存 / 提交 / 下一个清单 / 跳过”。

```
workflow.submit (Ctrl+Shift+Enter)
  ─► FIELDS_SERVICE.validate()             有错：定位到第一个错误字段并终止
  ─► kabel.save                             复用保存契约（草稿 / 正式数据都在 save 事件里落库）
  ─► emitAsync('record:submit', { recordId })   宿主或其他插件可否决（如锁已失效）
  ─► ARCHIVE_SERVICE.setStatus(submitted) ─► 按配置 archive.next()
```

`workflow.confirm`（Ctrl+Enter）、`workflow.back`（Ctrl+B）同理。按钮上的快捷键提示统一取 `commandBindings(command, state)`。

## 5. 底座需要补齐的能力

按优先级排列；均为通用机制，不引入业务概念。

### 5.1 内核：可选注入与服务变更通知（对照 cordis `inject`）

```ts
definePlugin({
  name: 'kabel:excerpt',
  dependencies: ['kabel:region-select', 'kabel:fields'],     // 硬依赖（插件名，已有）
  inject: { optional: [OCR_SERVICE, MARKS_SERVICE] },         // 软依赖（服务令牌，新增）
  setup(ctx) { ... },
});
```

- `ServiceRegistry.provide / dispose` 时派发 `service:change { id }`；`ctx.service(token)` 返回 `tryGet` 的结果，`ctx.onService(token, (svc) => teardown)` 在服务出现时执行、消失或被覆盖时自动调用 teardown（等价 cordis 中依赖服务变化时子作用域重建）。
- `inject.required`：服务不存在时插件进入“等待”而不是报错，服务出现后自动 setup——这样宿主可以晚一点再提供 OCR / 数据源，插件顺序无关。
- 插件管理页可以据此显示“缺少：识别服务”。

### 5.2 内核：作用域 `ctx.scope()`（对照 cordis Context fork）

```ts
const recordScope = ctx.scope();               // 子 DisposableStore，挂在插件上
ctx.on('record:change', () => {
  recordScope.reset();                          // 释放上一份档案的注册
  recordScope.contribute(FieldExtensions.validators, rulesFor(current));
});
```

档案切换是档案工具最频繁的生命周期事件；作用域让“随案卷注册、随案卷释放”不再需要手写清理。

### 5.3 工作台：页面元数据、版本、缩略图角标、显示滤镜

- `DocumentItem` 增加 `meta?: Record<string, unknown>`、`badges?: { text, tone }[]`（“封皮”角标、“草稿”标记）与 `variants?: { id, label, src }[]` + `variant?: string`（原图 / 成品图 / V1）；`WORKSPACE_SERVICE.setVariant(documentId, variantId)`、`updateDocument(id, patch)`（局部更新，不重置当前位置——现在的 `setDocuments` 会回到第一个文件）。
- 扩展点 `WorkspaceExtensions.fileDecorations`：文件目录 / 缩略图项上的角标与状态（已著录、有问题、已脱敏），由业务插件按 `documentId` 贡献。
- 舞台 `state.stage.filter`（亮度 / 对比度 / 反色 / 背景色），`ImageRenderer` 以 CSS filter 应用；与 `rotation` 一样随文件切换可选重置。
- 舞台“定位到区域”：`WORKSPACE_SERVICE.reveal(documentId, bbox)`——切页并把区域缩放平移到视野中，字段证据、问题、标注列表的点击定位都用它。

### 5.4 ui：快捷键提示与工具栏分组

- `ToolbarItem.showKeybinding`：按钮右侧显示生效快捷键（截图 2 的 `Ctrl+[` 角标），值来自 `commandBindings`。
- 工具栏支持具名分组（`section: '图像处理'`）与第二行，满足截图 2 的两行工具栏；仍是同一个扩展点。
- 状态栏 / 面板头的“横幅”位（截图 2 绿色“智能算法已调用”、截图 3 黄色“本页已框选，影像已锁定”）：新增扩展点 `ExtensionPoints.banners`（`{ id, region, tone, text(state), when }`）。

### 5.5 插件配置 Schema（对照 cordis Schema）

`definePlugin({ configSchema })`：声明配置项类型与默认值，设置页自动生成“插件配置”分类，配置经 `ctx.storage` 持久化。著录的字段 schema、AI 提取是否自动触发、提交后是否自动下一件，都属于这一类。

## 6. 典型联动时序

**切换到下一件（截图 1 “下一个清单”）**

```
archive.next
 └ emitAsync('record:before-leave')
     ├ fields：有未保存修改 → NOTIFY.confirm('保存后离开？') → kabel.save
     └ ai-extract：仍有待复核 → 按配置否决
 └ ARCHIVE_SOURCE.fetchPages → WORKSPACE.setDocuments → document:change
 └ emit('record:change')
     ├ fields：切换 values[recordId]，history.clear()（撤销不跨档案）
     ├ ai-extract：发起提取，逐项写入 source: 'ai'
     ├ marks：显示新档案各页标记
     └ 各插件 recordScope.reset()
```

**字段 ↔ 影像证据双向定位（截图 3）**

```
点击字段“题名” → fields.focus → field:focus
   → marks（evidence 层）高亮 data.key === 'title' 的框 → WORKSPACE.reveal(documentId, bbox)
点击影像上的“题名”框 → mark:activate → evidence 层 onActivate → FIELDS_SERVICE.focus('title')
```

两端都不知道对方是谁：字段模型只发 `field:focus`，标记只发 `mark:activate`，连接它们的是 `evidence` 图层的贡献者（摘录插件或 AI 提取插件）。

## 7. 场景预设

| 场景（截图） | 插件组合 | 布局 |
| --- | --- | --- |
| 案卷著录（1） | baseline + archive + fields + catalog + workflow + issues | 左：缩略图（工作台目录，开启 `badges`）；中：影像；右：著录（案卷目录 / 卷内目录） |
| 市场监管加工（2） | baseline + archive + fields + catalog + processing + image-process + excerpt + redaction + issues + workflow + region-select + marks | 左：档案详情（著录面板 `region: 'left'`，分组折叠）；中：影像；右：电子文件列表（工作台目录 `region: 'right'`）；两行工具栏 |
| 文书著录 + AI（3） | baseline + archive + fields + catalog + ai-extract + excerpt + region-select + marks + workflow | 左：件列表（archive 树）；中：影像 + 缩略图条；右：著录元数据 |
| 影像标注（4） | baseline + archive + marks + region-select + annotation + workflow | 左：缩略图；中：影像；右：标签列表 |

```ts
export function createCatalogPreset(options: CatalogPresetOptions): PluginInput[] {
  return [
    archivePlugin({ source: options.source }),
    fieldsPlugin({ schema: options.schema }),
    catalogPlugin({ panel: { region: options.formRegion ?? 'right' } }),
    options.ai !== false && aiExtractPlugin(options.ai),
    options.excerpt !== false && [regionSelectPlugin({ panel: false }), marksPlugin(), excerptPlugin()],
    workflowPlugin(options.workflow),
  ];
}

createArchiveEditor(el, {
  workspace: { directory: { region: 'left', title: '图片' } },
  plugins: [createCatalogPreset({ schema: volumeSchema, source: api })],
});
```

宿主只提供三样东西：**数据源**（`ARCHIVE_SOURCE`）、**字段 schema**、**识别 / 处理引擎**（可选）；保存与提交在 `save` / `record:submit` 事件里落库。

## 8. 落地顺序

1. 内核：`inject.optional` + `service:change` + `ctx.scope()`（§5.1、§5.2）。它们决定后续插件的写法，先做。
2. 工作台：`DocumentItem.meta / badges / variants`、`updateDocument`、`reveal`、`fileDecorations`（§5.3）。
3. L2：`archive` → `fields` → `marks`，各自 README + 单测（`setupPlugins()`）。
4. L3：`catalog` + `workflow` 先打通截图 1；再加 `excerpt` / `ai-extract`（截图 3）；`processing` / `redaction` / `annotation` / `issues` 按需。
5. L4：预设与 `examples/vue-app` 中的场景切换示例。

每一步都可独立发布：L2 插件在没有 L3 的情况下可单测，L3 插件在缺少软依赖时降级而不是报错。

## 9. 实现进度

以市场监管档案加工为首个场景，已落地：

| 设计项 | 实现 | 说明 |
| --- | --- | --- |
| §5.1 可选注入与服务变更通知 | `KabelPlugin.inject`、`ServiceRegistry.onChange`、`service:change` | 采用 cordis 语义：必需服务缺失时等待、注入的服务变化时重载（未单独提供 `ctx.onService`，重载即可覆盖其用途） |
| §5.2 作用域 | `ctx.scope()` | |
| §5.5 插件配置 Schema | `KabelPlugin.Config`（schemastery）、`kernel.plugins.updateConfig`、ui `SchemaForm`、插件管理“配置” | |
| 子插件 / 场景预设 | `ctx.plugin()`、`@kabel/plugin-market-supervision` | |
| §5.3 工作台 | `DocumentItem.meta`、`reveal`、`updateDocument`、`readBlob`、命令 `workspace.reveal` | 页面版本、缩略图角标、显示滤镜、`fileDecorations` 未做 |
| §5.4 ui | `ExtensionPoints.banners`、`ToolbarItem.showKeybinding` | 工具栏具名分组与第二行未做 |
| §3.2 字段模型 | `@kabel/plugin-fields`（`kabel:fields`） | 字段配置在插件 `Config` 中编辑；`scope`（案卷 / 卷内）、跨字段校验扩展点未做 |
| §3.4 识别引擎 | `@kabel/plugin-ocr`（`OCR_SERVICE`）、`@kabel/plugin-llm`（`LLM_SERVICE`） | OpenAI 兼容接口，地址在插件配置中设置 |
| §4.1 著录 | `@kabel/plugin-catalog` | |
| §4.2 框选摘录 | `@kabel/plugin-ocr-excerpt` | 证据框暂由本插件的覆盖层绘制，`kabel:marks` 落地后改为 `evidence` 图层 |
| §4.3 AI 提取 | `@kabel/plugin-layout-extract` | 整页 OCR + 大模型结构化提取 |
| 数据对接 | `@kabel/plugin-data-exchange` | 字段 / 文件列表 ⇄ JSON、YAML；加载与提交经事件交给业务层，插件不发请求、不持久化 |

未做：§3.1 档案上下文（`kabel:archive`）、§3.3 区域标记（`kabel:marks`）、§3.5 影像处理、§4.4–4.8（加工处理、脱敏、标注、质检问题、提交流程）。
