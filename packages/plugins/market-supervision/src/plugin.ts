import { definePlugin, ExtensionPoints } from '@kabel/core';
import { catalogPlugin, type CatalogConfig } from '@kabel/plugin-catalog';
import { dataExchangePlugin, type DataExchangeConfig } from '@kabel/plugin-data-exchange';
import { fieldsPlugin, type FieldsConfig } from '@kabel/plugin-fields';
import { layoutExtractPlugin, type LayoutExtractConfig } from '@kabel/plugin-layout-extract';
import { llmPlugin, type LlmConfig } from '@kabel/plugin-llm';
import { ocrPlugin, type OcrConfig } from '@kabel/plugin-ocr';
import { ocrExcerptPlugin, type ExcerptConfig } from '@kabel/plugin-ocr-excerpt';
import { regionSelectPlugin } from '@kabel/plugin-region-select';
import { FileList } from '@kabel/plugin-workspace';
import { MARKET_FIELD_GROUPS } from './fields';

export interface MarketSupervisionOptions {
  /** 字段模型（默认为市场监管档案的三组字段） */
  fields?: Partial<FieldsConfig>;
  catalog?: Partial<CatalogConfig>;
  /** 文字识别服务（默认 PaddleOCR-VL） */
  ocr?: Partial<OcrConfig>;
  /** 大模型服务 */
  llm?: Partial<LlmConfig>;
  excerpt?: Partial<ExcerptConfig> | false;
  layoutExtract?: Partial<LayoutExtractConfig> | false;
  /** 数据对接（加载数据 / 导出数据，交给业务层处理） */
  exchange?: Partial<DataExchangeConfig> | false;
}

export const MARKET_SUPERVISION_PLUGIN = 'kabel:market-supervision';

/** 默认的识别与模型服务地址（可在 设置 › 插件管理 中修改，修改后持久化） */
export const DEFAULT_OCR_ENDPOINT = 'http://10.20.0.14:8118/v1/models';
export const DEFAULT_LLM_ENDPOINT = 'http://10.20.0.15:8101/v1/models';

/**
 * 场景预设：市场监管档案加工。本身不含业务逻辑，只是一组子插件与它们的默认配置（cordis 的插件组合）：
 *
 * | 子插件 | 作用 |
 * | --- | --- |
 * | 字段模型 `kabel:fields` | 主体信息 / 事项信息 / 档案信息 三组字段，可在插件配置中增删改 |
 * | 著录面板 `kabel:catalog` | 左侧“档案详情数据” |
 * | 文字识别 `kabel:ocr` | PaddleOCR-VL（OpenAI 兼容接口） |
 * | 大模型 `kabel:llm` | 结构化提取 |
 * | 框选 `kabel:region-select` | 影像区域框选（不显示框选结果面板） |
 * | 框选识别回填 `kabel:ocr-excerpt` | OCR 框选（Ctrl+O）回填当前字段 |
 * | 版面分析自动填充 `kabel:layout-extract` | 整页识别 + 大模型提取，回填为待复核 |
 * | 数据对接 `kabel:data-exchange` | 加载数据、导出数据，经事件交给业务层 |
 *
 * 布局：左侧档案详情数据、中间档案影像、右侧电子文件列表。子插件随预设一起停用 / 卸载；
 * 用户在设置中保存的子插件配置优先于这里的默认值。
 */
export const marketSupervisionPreset = (options: MarketSupervisionOptions = {}) =>
  definePlugin({
    name: MARKET_SUPERVISION_PLUGIN,
    title: '市场监管档案加工',
    setup(ctx) {
      // 布局：文件目录移到右侧作为“电子文件列表”（同 id 贡献覆盖工作台的默认面板）
      ctx.contribute(ExtensionPoints.panels, {
        id: 'workspace.files',
        region: 'right',
        title: '电子文件列表',
        icon: 'folder',
        order: 10,
        view: FileList,
      });

      void ctx.plugin([
        fieldsPlugin({ groups: MARKET_FIELD_GROUPS as FieldsConfig['groups'], ...options.fields }),
        catalogPlugin({ region: 'left', title: '档案详情数据', columns: 2, ...options.catalog }),
        ocrPlugin({ endpoint: DEFAULT_OCR_ENDPOINT, ...options.ocr }),
        llmPlugin({ endpoint: DEFAULT_LLM_ENDPOINT, ...options.llm }),
        regionSelectPlugin({ panel: false }),
        options.excerpt !== false && ocrExcerptPlugin(options.excerpt || {}),
        options.layoutExtract !== false && layoutExtractPlugin({ scope: 'group', ...(options.layoutExtract || {}) }),
        options.exchange !== false && dataExchangePlugin(options.exchange || {}),
      ]);
    },
  });
