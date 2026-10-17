# @kabel/core · 微内核

Kabel 的内核：事件、状态、撤销重做、命令、服务、扩展点与插件管理。**不依赖任何渲染库**，可在 Node 中单测；界面由 `@kabel/ui` 渲染，功能全部由插件提供。

## 内容

| 模块 | 说明 |
| --- | --- |
| `Kernel` / `createKernel(options)` | 聚合以下所有能力；`kernel.use(plugin)` / `unuse(name)` 运行期注册与卸载 |
| `EventBus` | 同步 `emit`、可否决的 `emitAsync`；处理器异常转发到 `error` 事件；事件类型用模块扩充 `KabelEvents` 追加。`withSource(name)` / `emitAs(source, …)` 派发带来源的事件，`onAny((type, payload, { source }) => …)` 可知道是哪个插件触发的（插件的 `ctx.bus` / `ctx.emit` 自动带来源） |
| `Store` / `createSlice` | 单一状态树，切片 reducer 必须纯函数、不可变更新；`history: true` 的切片纳入撤销 |
| `History` | 快照式撤销 / 重做，连续变更可合并，支持事务与保存点（`state.history.dirty`） |
| `CommandRegistry` | 命令：`id`、`run`、`enabled`、`checked`、`keybinding`、`mutates`（只读时禁用）、`hidden`（不进命令面板）；`ownerOf(id)` 为注册它的插件，`command:before / after / error` 以它为来源派发 |
| `ServiceRegistry` / `createServiceToken` | 服务令牌：插件之间通过令牌共享能力，不直接 import 实现；覆盖栈，栈顶变化通知（`onChange` / `service:change`） |
| `ExtensionRegistry` / `ExtensionPoints` | 扩展点：`toolbar`、`statusbar`、`panels`（`slot: 'bottom'` 放在区域下半区）、`placements`（面板摆放：按面板 id 改位置 / 标题，不重新贡献视图）、`settings`、`contextMenu`、`banners`、`drawers`（最右侧抽屉）、`dialogs`、`formData`（表单提交数据，`collectFormData(kernel)` 汇总）；同 id 后注册者生效，释放后恢复前者 |
| `PluginManager` | 对照 cordis：`inject` 服务依赖（等待 / 启用 / 重载）、`Config` 配置（schemastery，持久化后重载）、`ctx.plugin` 子插件、`ctx.scope` 子作用域；依赖拓扑排序、同步 / 异步 setup、可恢复的停用 / 启用 |
| `Schema` | 配置 Schema（schemastery 再导出） |
| `ScopedStorage` | 带命名空间的持久化（默认 localStorage，可替换） |
| 快捷键工具 | `parseKeybinding`、`matchKeybinding`、`formatKeybinding`、`eventToKeybinding`、`sameKeybinding` |

## 内置插件

| 插件 | 名称 | 说明 |
| --- | --- | --- |
| `historyPlugin()` | `kabel:history` | 撤销 / 重做命令、快捷键与工具栏按钮 |
| `modePlugin({ readonly? })` | `kabel:mode` | 只读模式：`state.mode.readonly`，`mutates` 命令只读时自动禁用，事件 `mode:change` |
| `savePlugin({ confirmLeave? })` | `kabel:save` | 保存契约：`kabel.save`（`Mod+S`）先汇总 `ExtensionPoints.formData` 为载荷 `data`，再等待所有 `save` 事件处理器，成功后标记已保存并派发 `saved`，失败派发 `save:error` |

另导出消息与对话框的服务令牌 `NOTIFY_SERVICE`、底座弹窗的服务令牌 `DIALOG_SERVICE`（内容来自扩展点 `ExtensionPoints.dialogs`）、事件日志的服务令牌 `LOG_SERVICE`（`list / log / clear / subscribe / export / download`），实现都在 `@kabel/ui`。

## 最小示例

```ts
import { createKernel, createSlice, definePlugin, ExtensionPoints } from '@kabel/core';

const counter = createSlice({
  name: 'counter',
  initialState: { n: 0 },
  history: true,                                   // 纳入撤销
  reducers: { inc: (s) => ({ n: s.n + 1 }) },
});

const counterPlugin = definePlugin({
  name: 'acme:counter',
  setup(ctx) {
    ctx.registerSlice(counter);
    ctx.registerCommand({ id: 'counter.inc', title: '加一', run: (k) => k.dispatch(counter.actions.inc()) });
    ctx.contribute(ExtensionPoints.toolbar, { id: 'counter.inc', label: '加一', command: 'counter.inc' });
  },
});

const kernel = createKernel({ plugins: [counterPlugin] });
await kernel.execute('counter.inc');
```

通过 `ctx` 注册的一切都会在 `kernel.unuse(name)` 时逆序释放，不要直接调用底层 registry。

## 服务依赖与配置（cordis 模型）

```ts
import { definePlugin, Schema } from '@kabel/core';

const consumer = definePlugin({
  name: 'acme:consumer',
  inject: { required: [DB_SERVICE], optional: [CACHE_SERVICE] },
  Config: Schema.object({ limit: Schema.natural().default(10).description('条数') }),
  setup(ctx, config) {
    const db = ctx.services.get(DB_SERVICE);         // 必需服务一定存在
    ctx.plugin(childPlugin(), { … });                // 子插件随本插件释放
  },
});

kernel.plugins.status('acme:consumer');              // 'pending'：DB_SERVICE 尚未提供
kernel.plugins.blockers('acme:consumer');            // ['acme.db']
await kernel.plugins.updateConfig('acme:consumer', { limit: 20 });   // 校验、持久化、重载
```

## 单元测试

```ts
import { setupPlugins } from '@kabel/core/testing';

const { kernel, toolbar, statusbar, panels } = await setupPlugins(myPlugin());   // 内存存储
await kernel.execute('my.command');
```

## 相关文档

- [架构设计](../../docs/architecture.md)
- [插件开发指南](../../docs/plugin-guide.md)
- [API 参考](../../docs/api.md)
