# @kabel/plugin-ocr · 文字识别（能力插件）

通过 **OpenAI 兼容**的多模态接口调用识别模型，提供 `OCR_SERVICE`。默认指令适配 PaddleOCR-VL（`OCR:`、`Table Recognition:`），也可用于其他支持图片输入的模型服务。

插件名 `kabel:ocr`，不依赖其他插件。框选识别、版面分析等插件通过 `inject: [OCR_SERVICE]` 使用它；没有它时那些插件处于“等待服务”。

## 集成

```ts
import { ocrPlugin } from '@kabel/plugin-ocr';

createArchiveEditor(el, { plugins: [ocrPlugin({ endpoint: 'http://10.20.0.14:8118/v1/models' })] });
```

## 配置（设置 › 插件管理 › 文字识别（OCR） › 配置）

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `endpoint` | `http://127.0.0.1:8118/v1` | 服务地址；`/v1`、`/v1/models`、`/v1/chat/completions` 结尾均可 |
| `model` | 空 | 模型名称；留空时取 `GET /models` 的第一个 |
| `apiKey` | 空 | 以 `Authorization: Bearer` 发送 |
| `textPrompt` | `OCR:` | 区域识别（框选）指令 |
| `pagePrompt` | `OCR:` | 整页识别（版面分析）指令 |
| `tablePrompt` | `Table Recognition:` | 表格识别指令 |
| `maxTokens` | `4096` | 最大输出 token |
| `timeout` | `60000` | 超时（毫秒） |

修改后插件重载，注入了 `OCR_SERVICE` 的插件随之重载并拿到新服务。浏览器直连识别服务时，服务端需允许 CORS（或经宿主后端代理）。

## 服务 `OCR_SERVICE`

```ts
const { text, model } = await ocr.recognize(blob, { task: 'text' });   // task: 'text' | 'page' | 'table'
await ocr.models();                                                     // 连接测试
```

图片以 data URL 放在 `image_url` 中发送；SVG 等矢量图在浏览器中先绘制为 PNG。输出中的 Markdown 包裹（代码块、`**`、`#`）会被清理。

## 替换识别引擎

任何插件提供 `OCR_SERVICE` 即可替换（服务覆盖栈，后提供者生效），例如接入其他 OCR 网关：

```ts
definePlugin({ name: 'acme:ocr', setup: (ctx) => ctx.provide(OCR_SERVICE, { recognize: async (image) => …, models: async () => [] }) });
```
