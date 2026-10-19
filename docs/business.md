# 业务系统接入

Vue 3 业务系统只安装、只引入 **`@kabel/vue`**。内核、界面、工作台和宿主 API 都从这一个包来，样式也从这一个包来。

`@kabel/core`、`@kabel/ui`、`@kabel/editor`、`@kabel/plugin-workspace` 是它的内部依赖，业务工程的 `package.json` 和 `import` 里不出现它们。

不用 Vue 时，对应的一个包是 `@kabel/editor`（`createArchiveEditor`）。两种宿主二选一。

## 安装

私有源只代理 `@kabel` 作用域，项目根目录 `.npmrc`：

```
@kabel:registry=http://10.20.0.14:4873/
```

```bash
pnpm add @kabel/vue
```

`vue` 为 peer 依赖（`^3.3`）。

## 挂到页面

`main.ts` 注册一次：

```ts
import { KabelVue } from '@kabel/vue';
import '@kabel/vue/style.css';
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).use(KabelVue).mount('#app');
```

页面里只放一个组件。父容器要有高度，组件默认撑满父容器。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { ImageSourceInput, SavePayload } from '@kabel/vue';

const images = ref<ImageSourceInput[]>([
  { url: '/files/0001.jpg', name: '0001.jpg', group: '正文' },
  { url: '/files/0002.jpg', name: '0002.jpg', group: '正文' },
]);

async function onSave(payload: SavePayload) {
  await fetch('/api/archive/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload.data ?? {}),
  });
}
</script>

<template>
  <div style="height: 100vh">
    <KabelEditor
      instance-id="archive-1"
      :images="images"
      @save="onSave"
    />
  </div>
</template>
```

`@save` 可以返回 Promise。编辑器会等到它结束：成功后记为已保存，reject 则提示保存失败。快捷键是 Mod+S。

同一页放多个编辑器时，每个实例用不同的 `instance-id`，布局和插件配置按这个 id 分开保存。

## 打开的文件

`images` 的每一项是一条影像，显示在文件目录和内容区。换一批文件时换成新数组。

| 写法 | 含义 |
| --- | --- |
| `{ url, name, group }` | 地址。`group` 是目录名，同一目录折在一组 |
| `{ base64, name, mime? }` | 纯 base64，MIME 可省略，按文件头识别 |
| `{ blob }` 或 `File` | 本地文件 |
| `() => fetch(url).then((r) => r.blob())` | 按需下载（鉴权地址用这个） |

## 保存时拿到什么

`payload.data` 是各插件贡献的表单数据，键是插件约定的 id。没有业务插件时，这里通常是空对象，业务系统用自己的表单提交。

工具栏「查看表单数据」和 `editor.getFormData()` 看的是同一份数据。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { ArchiveEditor } from '@kabel/vue';

const editor = ref<ArchiveEditor | null>(null);

function onReady(instance: ArchiveEditor) {
  editor.value = instance;
}
</script>

<template>
  <KabelEditor @ready="onReady" @save="onSave" />
</template>
```

模板 ref 也可以：`const host = ref<InstanceType<typeof KabelEditor>>()`，然后 `host.value?.save()`。

## 业务界面放进工作台

业务自己的表单、按钮放进插槽，保留宿主的路由、状态和组件库。左右两侧没有面板时整栏不显示。

```vue
<template>
  <KabelEditor :images="images" :readonly="readonly" @save="onSave">
    <KabelPanel id="biz.detail" region="right" title="档案信息" :order="10">
      <ArchiveForm />
    </KabelPanel>
    <KabelToolbarButton id="biz.submit" icon="submit" label="提交" :order="60" @click="submit" />
  </KabelEditor>
</template>
```

`KabelPanel` 的 `region` 为 `left` 或 `right`。面板切换、折叠时内容保持挂载。

在面板内部读编辑器状态：

```ts
import { useKabel, useKabelState } from '@kabel/vue';

const editor = useKabel();
const dirty = useKabelState((s) => s.history.dirty, false);
```

只读把 `:readonly="true"` 传进去。会改数据的操作在只读下不可用。

## 现成的档案加工

著录、框选识别、版面分析、字段模型这些能力已经打成场景预设。业务代码只再装这一个预设包，挂到 `plugins` 上。字段、OCR、大模型、著录面板由预设带上，业务工程不逐个安装、不逐个 import。

```bash
pnpm add @kabel/plugin-market-supervision
```

```vue
<script setup lang="ts">
import { marketSupervisionPreset } from '@kabel/plugin-market-supervision';
import type { SavePayload } from '@kabel/vue';

const plugins = [
  marketSupervisionPreset({
    ocr: { endpoint: 'http://10.20.0.14:8118/v1' },
    llm: { endpoint: 'http://10.20.0.15:8101/v1', model: 'qwen2.5-14b-instruct' },
    exchange: { format: 'json', submitOnSave: true },
  }),
];

async function onSave(_payload: SavePayload) {
  // submitOnSave 为 true 时，保存会先走数据对接的提交
}
</script>

<template>
  <KabelEditor :images="images" :plugins="plugins" :layout="{ regions: { left: { size: 640, max: 900 } } }" @save="onSave" />
</template>
```

预设打开后的布局：左侧「档案详情数据」，中间影像，右侧「电子文件列表」。识别地址、字段分组可在 设置 › 插件管理 里改，改完的配置保存在浏览器里，优先于代码里的默认值。

和业务接口对接时监听这两个事件（在 `@ready` 里挂上）：

```ts
editor.on('data-exchange:load', async () => {
  const res = await fetch('/api/archive/1');
  return res.json();
});

editor.on('data-exchange:submit', async ({ data, text, mime }) => {
  const res = await fetch('/api/archive/1', {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: text,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data;
});
```

`data-exchange:load` 的返回值是接口数据（对象或 JSON / YAML 文本），用来填字段。`data-exchange:submit` 在校验通过后把当前字段交给业务系统；reject 表示提交失败。

不需要某一项时关掉它：`layoutExtract: false` 关掉版面分析，`exchange: false` 关掉数据对接。

## 非 Vue

```ts
import { createArchiveEditor } from '@kabel/editor';
import '@kabel/editor/style.css';

const editor = createArchiveEditor('#archive', {
  images,
  plugins: [marketSupervisionPreset()],
});
editor.on('save', async () => {
  await api.save(await editor.getFormData());
});
```

这里的一个包是 `@kabel/editor`。场景预设的用法与上一节相同。
