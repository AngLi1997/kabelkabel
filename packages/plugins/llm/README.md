# @kabel/plugin-llm · 大模型（能力插件）

通过 **OpenAI 兼容**接口（`/v1/chat/completions`）调用部署的大模型，提供 `LLM_SERVICE`。版面分析自动填充等插件用它做结构化提取。

插件名 `kabel:llm`，不依赖其他插件。

## 集成

```ts
import { llmPlugin } from '@kabel/plugin-llm';

createArchiveEditor(el, { plugins: [llmPlugin({ endpoint: 'http://10.20.0.15:8101/v1/models' })] });
```

## 配置（设置 › 插件管理 › 大模型（LLM） › 配置）

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `endpoint` | `http://127.0.0.1:8101/v1` | 服务地址；`/v1`、`/v1/models` 结尾均可 |
| `model` | 空 | 模型名称；留空时取 `GET /models` 的第一个 |
| `apiKey` | 空 | 以 `Authorization: Bearer` 发送 |
| `temperature` | `0.1` | 温度 |
| `maxTokens` | `2048` | 最大输出 token |
| `jsonMode` | `false` | 发送 `response_format: { type: 'json_object' }`（服务端支持时开启） |
| `timeout` | `120000` | 超时（毫秒） |

## 服务 `LLM_SERVICE`

```ts
const { content } = await llm.chat([{ role: 'user', content: '…' }], { temperature: 0 });
const data = await llm.json<{ name: string }>(messages);   // 解析输出中的 JSON（容忍 ```json 代码块与前后说明）
await llm.models();
```

任何插件提供 `LLM_SERVICE` 即可替换实现。
