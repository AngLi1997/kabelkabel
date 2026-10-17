# @kabel/plugin-ocr-excerpt · 框选识别回填（业务插件）

选中字段 → 在档案影像上框选区域 → OCR 识别 → 按字段类型规整后回填，并把框选位置记为字段的**影像证据**：影像上以虚线框和字段名标出，选中字段时高亮，字段下方“定位”可回到该位置。

插件名 `kabel:ocr-excerpt`，`inject: [WORKSPACE_SERVICE, FIELDS_SERVICE, REGION_SERVICE, OCR_SERVICE]`。任一服务缺失时插件处于“等待服务”，按钮不出现；它不 import 任何其他业务插件。

## 集成

```ts
createArchiveEditor(el, {
  plugins: [fieldsPlugin({ groups }), catalogPlugin(), ocrPlugin({ endpoint }), regionSelectPlugin({ panel: false }), ocrExcerptPlugin()],
});
```

## 配置

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `shape` | `rect` | 框选形状：`rect` / `polygon` |
| `autoNext` | `true` | 回填后跳到下一个字段（连续框选录入） |
| `review` | `false` | 识别结果标记为待复核 |
| `revealOnFocus` | `true` | 选中带证据的字段时，若证据在其他页则切过去并定位 |

## 使用

| 方式 | 说明 |
| --- | --- |
| 工具栏“OCR 框选”或 `Ctrl+O` | 为当前字段框选（没有当前字段时取第一个空字段）；再按一次取消 |
| 字段名旁的识别按钮 | 为该字段框选 |
| 框选中 `Esc` | 取消 |

框选请求以 `origin: 'kabel:ocr-excerpt'` 发起：结果不进入“框选结果”面板，也不会被只处理 `origin === 'user'` 的插件误收。可回填的字段类型：文本、多行文本、日期、数字、下拉、单选（字段配置 `ocr: false` 可排除）。

## 命令、事件与贡献

| 项 | 说明 |
| --- | --- |
| 命令 `excerpt.pick` | `Mod+O`，可带参数字段 key；`mutates`（只读时禁用） |
| 事件 `excerpt:fill` | `{ key, text, documentId }` |
| 横幅 `excerpt.status` | “请在影像上框选「…」所在区域（Esc 取消）”“正在识别…” |
| 覆盖层 `excerpt.evidence` | 字段证据框 |
| 字段操作 `excerpt.field` | `FieldExtensions.actions` |

## 样式

类名前缀 `kb-excerpt`。
