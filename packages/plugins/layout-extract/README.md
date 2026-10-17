# @kabel/plugin-layout-extract · 版面分析自动填充（业务插件）

对选定范围的页做整页识别（OCR），再由大模型按字段配置（名称、类型、可选值、提取提示）做结构化提取，结果按字段类型规整后以 **“AI 已填入 · 待复核”** 回填字段模型。

插件名 `kabel:layout-extract`，`inject: [WORKSPACE_SERVICE, FIELDS_SERVICE, OCR_SERVICE, LLM_SERVICE]`。识别与模型的服务地址分别在文字识别、大模型插件的配置中设置。

## 集成

```ts
createArchiveEditor(el, {
  plugins: [fieldsPlugin({ groups }), catalogPlugin(), ocrPlugin({ endpoint: ocrUrl }), llmPlugin({ endpoint: llmUrl }), layoutExtractPlugin({ scope: 'group' })],
});
```

## 配置

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `scope` | `current` | 分析范围：`current` 当前页 / `group` 当前材料项（同目录的页）/ `all` 全部文件 |
| `maxPages` | `6` | 最多分析页数 |
| `overwrite` | `ai` | 回填策略：`empty` 只填空字段 / `ai` 只覆盖上次 AI 结果（人工输入、宿主载入、框选识别的值不被覆盖）/ `all` 全部覆盖 |
| `review` | `true` | 回填结果标记为待复核 |
| `autoRun` | `false` | 文件列表变化后自动分析 |
| `systemPrompt` | 内置 | 提取指令（多行） |

## 流程

```
layoutExtract.run (Mod+Shift+E)
  → 各页 WORKSPACE_SERVICE.readBlob → OCR_SERVICE.recognize(blob, { task: 'page' })
  → LLM_SERVICE.json([system, 字段清单 + 各页文本])
  → 按回填策略筛选 → FIELDS_SERVICE.setMany(entries, { source: 'ai', review: 'pending' })   // 一条撤销记录
```

模型输出容忍 ```json 代码块、以字段名（而非 key）为键、`{ value }` 包裹。

## 命令、事件与贡献

| 项 | 说明 |
| --- | --- |
| 命令 `layoutExtract.run` | `Mod+Shift+E`，`mutates` |
| 命令 `layoutExtract.cancel` | 取消进行中的分析 |
| 事件 `layout-extract:done` | `{ values, filled, documentIds }` |
| 横幅 `layoutExtract.status` | 进行中 / “智能算法已调用（OCR / 版面分析 / 结构化数据提取）：回填 N 个字段，待复核 M” / 失败；带“重新分析” |

## 状态

切片 `layoutExtract`（不入撤销）：`status`（`idle` / `ocr` / `llm` / `done` / `error`）、`done` / `total`、`filled`、`message`。
