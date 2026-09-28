# @kabel/plugin-annotation · 图片标记

在影像上拉框标记要素的插件（插件名 `kabel:annotation`，插件管理中显示为“图片标记”），baseline 默认启用，依赖 `kabel:viewer`。

## 功能

- **标记类型**：显示在顶部工具栏，数字键 `1`–`9` 切换前九个类型；有选中标记时同时修改其类型。
- **拉框标记**：在影像上拖拽新建；点击选中，拖动移动，拖动四角调整大小；缩放、旋转后仍与影像对齐。坐标为图片原始像素。
- **标记列表**（右侧“标记”标签页）：当前页的标记，可修改类型、删除；与影像双向高亮；底部显示本页 / 全部数量。
- **撤销 / 重做**：新建、移动、调整、改类型、删除都纳入历史。
- **导出**：JSON；YOLO（zip：`classes.txt`、`data.yaml`、`labels/<图片名>.txt`，坐标归一化）。
- **工具**：影像侧边工具条中的“框选”（`R`）与“拖动”（`H`，或按住空格临时拖动）。

## 集成

baseline 默认包含。自定义标记类型：

```ts
const editor = createArchiveEditor('#app', {
  images,
  annotation: {
    labels: ['题名', '文号', { name: '印章', color: '#c00' }],
    fileName: (kernel) => `annotations-${Date.now()}`,
  },
});

// 保存 / 恢复（例如随档案一起保存）
const doc = editor.getAnnotations();
await editor.setImages(nextImages);
editor.setAnnotations(savedDoc);          // 影像加载中调用也可以，就绪后生效

// 导出数据（不触发下载）
editor.exportAnnotations('json');         // AnnotationDocument
editor.exportAnnotations('yolo');         // { 'classes.txt': '…', 'labels/0001.txt': '…', … }
```

Vue：`<KabelEditor :annotation="{ labels }" />`，实例方法 `getAnnotations()` / `setAnnotations(doc)`。传 `annotation: false` 关闭。

单独组合：

```ts
createKernel({ plugins: [layoutPlugin(), historyPlugin(), viewerPlugin({ images }), annotationPlugin({ labels })] });
```

并引入 `@kabel/plugin-viewer/style.css` 与 `@kabel/plugin-annotation/style.css`。

## 配置 `AnnotationPluginOptions`

| 选项 | 说明 |
| --- | --- |
| `labels` | 标记类型：名称字符串或 `{ id?, name, color? }`；默认 题名、文号、责任者、成文日期、印章、签名、正文、表格、附件 |
| `fileName` | 导出文件名（不含扩展名）或函数，默认 `annotations` |
| `panel` | 覆盖列表面板 `title` / `region` / `order`（默认 `标记` / `right` / `10`） |

## 命令与快捷键

| 命令 | 快捷键 | 说明 |
| --- | --- | --- |
| `annotation.label.1` … `annotation.label.9` | `1` … `9` | 切换标记类型 |
| `annotation.setLabel(id)` | | 切换标记类型（有选中时同时修改其类型） |
| `annotation.tool.draw` / `annotation.tool.pan` | `R` / `H` | 框选 / 拖动工具 |
| `annotation.delete` | `Delete` / `Backspace` | 删除选中标记 |
| `annotation.deselect` | `Escape` | 取消选中 |
| `annotation.exportJson` / `annotation.exportYolo` | | 下载导出文件 |

无修饰键的快捷键在输入框内不触发。

## 数据格式

```ts
interface AnnotationDocument {
  labels: { id: string; name: string; color: string }[];
  images: {
    id: string; name?: string; width?: number; height?: number;
    annotations: { id?: string; label: string; bbox: [x, y, w, h] }[];   // label 为类型名称或 id
  }[];
}
```

YOLO 每行：`类别序号 中心x 中心y 宽 高`（0–1），类别序号为 `labels` 中的顺序。

## 服务 `ANNOTATION_SERVICE`

`getLabels()`、`getAnnotations()`、`setAnnotations(doc | null)`、`exportJson()`、`exportYolo()`。

## 事件与状态

- 事件 `annotation:change`：`{ annotations }`。
- 切片 `annotations`（纳入撤销）：`{ [imageId]: Annotation[] }`；切片 `annotator`（不纳入）：`labels, active, selected, hovered, tool, sizes`。
- 影像列表被替换（切换档案）时标记清空。

## 实现说明

通过 `@kabel/plugin-viewer` 的 `ViewerExtensions.overlays`（覆盖层与坐标换算）和 `ViewerExtensions.tools` 接入，不修改影像查看插件内部。

## 样式

`@kabel/plugin-annotation/style.css`（已包含在 `@kabel/editor/style.css` 中）。
