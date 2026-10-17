# @kabel/plugin-market-supervision · 市场监管档案加工（场景预设）

场景预设本身**不含业务逻辑**，只是一组子插件与它们的默认配置（cordis 的插件组合，`ctx.plugin()`）：

| 子插件 | 层 | 默认配置 |
| --- | --- | --- |
| 字段模型 `kabel:fields` | 能力 | 主体信息 / 事项信息 / 档案信息 三组字段（`MARKET_FIELD_GROUPS`） |
| 著录面板 `kabel:catalog` | 业务 | 左侧“档案详情数据”，两列 |
| 文字识别 `kabel:ocr` | 能力 | `http://10.20.0.14:8118/v1/models`（PaddleOCR-VL） |
| 大模型 `kabel:llm` | 能力 | `http://10.20.0.15:8101/v1/models` |
| 框选 `kabel:region-select` | 能力 | 不显示“框选结果”面板 |
| 框选识别回填 `kabel:ocr-excerpt` | 业务 | `Ctrl+O` |
| 版面分析自动填充 `kabel:layout-extract` | 业务 | 范围：当前材料项 |
| 数据对接 `kabel:data-exchange` | 业务 | 控件：加载数据、提交；JSON |

布局：左侧档案详情数据、中间档案影像、右侧电子文件列表（同 id 贡献把工作台的文件目录移到右侧）。

## 集成

```ts
import { marketSupervisionPreset } from '@kabel/plugin-market-supervision';

const editor = createArchiveEditor(el, {
  images,                                   // group 为材料项，如“企业设立登记申请书”
  layout: { regions: { left: { size: 640, max: 900 } } },
  plugins: [marketSupervisionPreset()],
});
editor.on('save', () => api.save(editor.kernel.services.get(FIELDS_SERVICE).values()));
// 数据对接：业务层提供加载的数据、接收提交的 JSON / YAML
editor.on('data-exchange:load', () => api.fetchArchive());
editor.on('data-exchange:submit', ({ text }) => api.submitArchive(text));
```

可选参数覆盖各子插件的注册方配置，或关闭某项能力：

```ts
marketSupervisionPreset({
  ocr: { endpoint: 'http://ocr.example.com/v1' },
  llm: { model: 'qwen2.5-14b-instruct' },
  layoutExtract: false,                     // 不启用版面分析
  exchange: { controls: ['load', 'submit', 'export'], format: 'yaml' },   // 数据对接：控件与格式
});
```

## 配置与运行期调整

- 设置 › 插件管理 中，子插件列在“市场监管档案加工”之下，可单独停用、编辑配置（字段分组与字段、识别 / 模型地址、回填策略…）；用户保存的配置优先于预设默认值并持久化。
- 停用文字识别：框选识别回填与版面分析进入“等待服务”，按钮消失；重新启用后自动恢复。
- 停用预设：全部子插件随之卸载。

示例：`pnpm dev` 后在场景列表进入「市场监管场景」，或打开 `http://localhost:5178/?scene=market`。
