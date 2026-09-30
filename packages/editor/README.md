# @kabel/editor · 主包

Kabel 的主包：baseline 预设（底座）+ `createArchiveEditor` 宿主 API，并再导出 `@kabel/core`、`@kabel/ui`、`@kabel/plugin-workspace` 的全部内容，**宿主只需安装这一个包**（Vue 项目安装 `@kabel/vue`）。

```bash
npm install @kabel/editor
```

## 使用

```ts
import { createArchiveEditor } from '@kabel/editor';
import '@kabel/editor/style.css';

const editor = createArchiveEditor('#app', {
  images: [{ url: '/scans/0001.jpg', group: '正文' }, { blob: file, group: '附件' }],
  readonly: false,
});

editor.on('save', async () => api.save());          // Mod+S / editor.save() 会等待它完成
editor.on('document:change', ({ index, document }) => {});
await editor.setImages(next);                        // 打开另一批文件
await editor.use(myPlugin());                        // 运行期注册业务插件
editor.destroy();
```

`ArchiveEditor` 提供：`on / once / off / emit`、`execute`、`use / unuse`、`getState / subscribe`、`setImages / getImages`、`setDocuments / getDocuments / getCurrentDocument / goto`、`save`、`setReadonly / isReadonly`、`notify / confirm`、`undo / redo / isDirty`、`layout.*`、`destroy`。完整选项与方法见 [API 参考](../../docs/api.md)。

## baseline 预设

`createBaselinePreset(options)` 组装底座的内置插件：布局、撤销重做、只读模式、保存契约、消息与对话框、快捷键、右键菜单、命令面板、工作台、设置、主题。默认布局为左侧“文件目录”、中间“内容”（影像）、右侧无面板；业务功能（著录、标注等）不属于底座，一律以插件接入，并只依赖 [`@kabel/plugin-workspace`](../plugins/workspace/README.md)（工作台，所有业务插件的底座）。

按需组合或替换：

```ts
createArchiveEditor(el, { preset: [layoutPlugin(), historyPlugin(), workspacePlugin()] });
createArchiveEditor(el, { preset: false, plugins: [/* 完全自定义 */] });
```

## 扩展插件

新增的业务插件统一放在仓库的 [`packages/plugins`](../plugins/README.md) 目录，以 `@kabel/plugin-<name>` 分发，宿主通过 `plugins` 选项或 `editor.use()` 注册。

## 相关文档

- [API 参考](../../docs/api.md) · [架构设计](../../docs/architecture.md) · [插件开发指南](../../docs/plugin-guide.md)
