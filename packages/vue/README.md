# @kabel/vue · Vue 3 适配器

`<KabelEditor>`、`<KabelPanel>`、`<KabelToolbarButton>`、`vueView()` 与组合式 API。依赖 `vue ^3.3`（peer），并再导出 `@kabel/editor` 的全部内容，**Vue 宿主只需安装这一个包**。

```bash
npm install @kabel/vue
```

```ts
// main.ts
import { KabelVue } from '@kabel/vue';
import '@kabel/vue/style.css';
createApp(App).use(KabelVue).mount('#app');
```

```vue
<template>
  <!-- @save 返回 Promise：编辑器等待其完成，reject 即保存失败 -->
  <KabelEditor :images="images" :readonly="readonly" instance-id="demo" @save="onSave" @saved="onSaved">
    <KabelToolbarButton id="host.reload" icon="rotate-right" label="重新载入" @click="reload" />
    <!-- 宿主 Vue 内容作为面板嵌入，保留响应式 / provide / 全局组件；region 可选 left / right -->
    <KabelPanel id="host.info" region="right" title="文件信息">
      <FileInfo />
    </KabelPanel>
  </KabelEditor>
</template>
```

## 导出

| 导出 | 说明 |
| --- | --- |
| `KabelEditor` | 挂载工作台；属性 `images`、`readonly`、`save`、`workspace`、`plugins`、`layout`、`theme`、`instance-id`、`storage`、`icons`、`height`…；事件 `save` / `saved` / `save-error` / `readonly-change` / `dirty-change` / `ready` / `error`；实例方法 `save`、`setReadonly`、`notify`、`confirm`、`setImages`、`undo` / `redo`、`execute`、`use` / `unuse`、`getEditor` |
| `KabelPanel` | 在模板中声明一个面板，插槽内容 Teleport 到左 / 右 / 中区域，保留宿主上下文；标签切换或折叠时保持挂载 |
| `KabelToolbarButton` | 工具栏按钮 / 分隔符，可绑定已有命令 |
| `vueView(Component)` | 把 Vue 组件转成插件面板视图，继承宿主 appContext |
| `useKabel()` / `useKabelState(selector, fallback)` | 在 `<KabelEditor>` 后代中取得编辑器实例 / 响应式订阅状态 |
| `KabelVue` | `app.use(KabelVue)` 全局注册组件 |

组件高度默认 `100%`，请给父容器设置高度（或传 `height`）。

## 相关文档

- [Vue 3 集成](../../docs/vue.md)（属性、事件、实例方法、常见问题）
- 示例：[`examples/vue-app`](../../examples/vue-app)
