import type { ImageSourceInput, LayoutOptions, PluginInput } from '@kabel/vue';
import { catalogPlugin, CATALOG_PLUGIN } from '@kabel/plugin-catalog';
import { fieldsPlugin, FIELDS_PLUGIN } from '@kabel/plugin-fields';
import { fileLoaderPlugin, FILE_LOADER_PLUGIN } from '@kabel/plugin-file-loader';
import { layoutExtractPlugin, LAYOUT_EXTRACT_PLUGIN } from '@kabel/plugin-layout-extract';
import { llmPlugin, LLM_PLUGIN } from '@kabel/plugin-llm';
import {
  DEFAULT_LLM_ENDPOINT,
  DEFAULT_OCR_ENDPOINT,
  marketSupervisionPreset,
} from '@kabel/plugin-market-supervision';
import { ocrPlugin, OCR_PLUGIN } from '@kabel/plugin-ocr';
import { ocrExcerptPlugin, EXCERPT_PLUGIN } from '@kabel/plugin-ocr-excerpt';
import { regionSelectPlugin, REGION_SELECT_PLUGIN } from '@kabel/plugin-region-select';
import { marketImages } from './market';
import { sampleImages } from './scans';

/** 演示里可手动添加的插件。初始配置写在这里，不往插件包里放演示数据。 */
export interface DemoPluginSpec {
  id: string;
  title: string;
  create: () => PluginInput;
}

export const demoPlugins: readonly DemoPluginSpec[] = [
  { id: FILE_LOADER_PLUGIN, title: '文件加载', create: () => fileLoaderPlugin() },
  { id: REGION_SELECT_PLUGIN, title: '框选', create: () => regionSelectPlugin() },
  { id: FIELDS_PLUGIN, title: '字段模型', create: () => fieldsPlugin() },
  {
    id: CATALOG_PLUGIN,
    title: '著录面板',
    create: () => catalogPlugin({ region: 'right', title: '档案详情数据', columns: 2 }),
  },
  { id: OCR_PLUGIN, title: '文字识别（OCR）', create: () => ocrPlugin() },
  { id: LLM_PLUGIN, title: '大模型（LLM）', create: () => llmPlugin() },
  { id: EXCERPT_PLUGIN, title: '框选识别回填', create: () => ocrExcerptPlugin() },
  { id: LAYOUT_EXTRACT_PLUGIN, title: '版面分析自动填充', create: () => layoutExtractPlugin() },
];

const STORAGE_KEY = 'kabel-demo:scene-plugins';

function readAddedMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return {};
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []]),
    );
  } catch {
    return {};
  }
}

/** 该场景里用户手动添加、并希望下次进入仍然加载的插件 id */
export function loadAddedPlugins(sceneId: string): string[] {
  const known = new Set(demoPlugins.map((item) => item.id));
  return (readAddedMap()[sceneId] ?? []).filter((id) => known.has(id));
}

export function saveAddedPlugins(sceneId: string, ids: string[]): void {
  const all = readAddedMap();
  all[sceneId] = ids;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function createDemoPlugin(id: string): PluginInput | undefined {
  return demoPlugins.find((item) => item.id === id)?.create();
}

export type SceneId = 'free' | 'market' | 'document';

export interface DemoScene {
  id: SceneId;
  title: string;
  /** 列表中对插件加载方式的说明 */
  pluginsLabel: string;
  /** 不预置业务插件，进入后可从演示目录手动添加 */
  allowAdd: boolean;
  /** 预置插件的配置在设置 › 插件管理中修改 */
  allowConfig: boolean;
  images: () => ImageSourceInput[];
  layout?: LayoutOptions;
  plugins: () => PluginInput[];
}

const archiveImages = () => sampleImages('关于档案工作的通知');

/**
 * 市场监管场景的初始配置。
 * 字段分组仍用预设自带的设计；地址、面板和布局在演示页指定，方便直接改。
 */
const marketInit = {
  layout: { regions: { left: { size: 640, max: 900 }, right: { size: 260 } } } satisfies LayoutOptions,
  preset: {
    catalog: { region: 'left' as const, title: '档案详情数据', columns: 2 },
    ocr: { endpoint: DEFAULT_OCR_ENDPOINT },
    llm: { endpoint: DEFAULT_LLM_ENDPOINT },
    layoutExtract: { scope: 'group' as const },
  },
};

export const scenes: readonly DemoScene[] = [
  {
    id: 'free',
    title: '自由场景',
    pluginsLabel: '不加载业务插件，可手动添加',
    allowAdd: true,
    allowConfig: false,
    images: archiveImages,
    plugins: () => [],
  },
  {
    id: 'market',
    title: '市场监管场景',
    pluginsLabel: '内置市场监管档案加工，可修改配置',
    allowAdd: false,
    allowConfig: true,
    images: marketImages,
    layout: marketInit.layout,
    plugins: () => [marketSupervisionPreset(marketInit.preset)],
  },
  {
    id: 'document',
    title: '文书著录场景',
    pluginsLabel: '暂与自由场景相同',
    allowAdd: true,
    allowConfig: false,
    images: archiveImages,
    plugins: () => [],
  },
];

export function findScene(id: string | null): DemoScene | undefined {
  return scenes.find((scene) => scene.id === id);
}
