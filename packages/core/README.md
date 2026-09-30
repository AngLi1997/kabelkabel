# @kabel/core · 微内核

Kabel 的内核：事件、状态、撤销重做、命令、服务、扩展点与插件管理。**不依赖任何渲染库**，可在 Node 中单测；界面由 `@kabel/ui` 渲染，功能全部由插件提供。

## 内容

| 模块 | 说明 |
| --- | --- |
| `Kernel` / `createKernel(options)` | 聚合以下所有能力；`kernel.use(plugin)` / `unuse(name)` 运行期注册与卸载 |
| `EventBus` | 同步 `emit`、可否决的 `emitAsync`；处理器异常转发到 `error` 事件；事件类型用模块扩充 `KabelEvents` 追加 |
| `Store` / `createSlice` | 单一状态树，切片 reducer 必须纯函数、不可变更新；`history: true` 的切片纳入撤销 |
| `History` | 快照式撤销 / 重做，连续变更可合并，支持事务与保存点（`state.history.dirty`） |
| `CommandRegistry` | 命令：`id`、`run`、`enabled`、`checked`、`keybinding`、`mutates`（只读时禁用）、`hidden`（不进命令面板） |
| `ServiceRegistry` / `createServiceToken` | 服务令牌：插件之间通过令牌共享能力，不直接 import 实现 |
| `ExtensionRegistry` / `ExtensionPoints` | 扩展点：`toolbar`、`statusbar`、`panels`、`settings`、`contextMenu`；同 id 后注册者生效，释放后恢复前者 |
| `PluginManager` | 依赖拓扑排序、同步 / 异步 setup、按依赖逆序卸载；可恢复的停用 / 启用 |
| `ScopedStorage` | 带命名空间的持久化（默认 localStorage，可替换） |
| 快捷键工具 | `parseKeybinding`、`matchKeybinding`、`formatKeybinding`、`eventToKeybinding`、`sameKeybinding` |

## 内置插件

| 插件 | 名称 | 说明 |
| --- | --- | --- |
| `historyPlugin()` | `kabel:history` | 撤销 / 重做命令、快捷键与工具栏按钮 |
| `modePlugin({ readonly? })` | `kabel:mode` | 只读模式：`state.mode.readonly`，`mutates` 命令只读时自动禁用，事件 `mode:change` |
| `savePlugin({ confirmLeave? })` | `kabel:save` | 保存契约：`kabel.save`（`Mod+S`）等待所有 `save` 事件处理器，成功后标记已保存并派发 `saved`，失败派发 `save:error` |

另导出消息与对话框的服务令牌 `NOTIFY_SERVICE`（实现在 `@kabel/ui`）。

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
