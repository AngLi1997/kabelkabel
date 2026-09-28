# @kabel/plugin-inspector · 辅助信息

右侧辅助面板插件（插件名 `kabel:inspector`，插件管理中显示为“辅助信息”），依赖 `kabel:metadata`（文书著录），随其一起启用。

## 功能

- **校验结果**：列出当前校验错误，点击定位到对应字段；面板操作“重新校验”。
- **操作记录**：撤销栈列表，点击跳转到任意历史位置；面板操作“撤销”“重做”。

两个面板位于右侧区域的标签页中（排在“标记”“著录信息”之后）。

## 集成

`createArchiveEditor` / `<KabelEditor>` 启用文书著录时自动包含：

```ts
createArchiveEditor('#app', { schema, inspector: { panels: ['history'] } });   // 只保留操作记录
createArchiveEditor('#app', { schema, inspector: false });                     // 关闭
```

单独组合（需同时注册 `metadataPlugin`，否则注册失败）：

```ts
createKernel({ plugins: [layoutPlugin(), historyPlugin(), metadataPlugin({ schema }), inspectorPlugin()] });
```

并引入 `@kabel/plugin-inspector/style.css`。

## 配置 `InspectorPluginOptions`

| 选项 | 说明 |
| --- | --- |
| `panels` | 启用的面板：`'validation'`、`'history'`，默认全部 |

## 贡献

| 面板 id | 标题 | 排序 |
| --- | --- | --- |
| `inspector.validation` | 校验结果 | 30 |
| `inspector.history` | 操作记录 | 40 |

使用的命令：`metadata.validate`、`metadata.focusField`、`kabel.undo`、`kabel.redo`。

## 样式

`@kabel/plugin-inspector/style.css`（已包含在 `@kabel/editor/style.css` 中）。
