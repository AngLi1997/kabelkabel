import {
  definePlugin,
  ExtensionPoints,
  FileList,
  type ImageSourceInput,
  type LayoutOptions,
  type PluginInput,
} from '@kabel/vue';
import { catalogPlugin, CATALOG_PLUGIN } from '@kabel/plugin-catalog';
import { dataExchangePlugin, DATA_EXCHANGE_PLUGIN } from '@kabel/plugin-data-exchange';
import { dataTablePlugin, DATA_TABLE_PLUGIN } from '@kabel/plugin-data-table';
import { fieldsPlugin, FIELDS_PLUGIN, type FieldsConfig } from '@kabel/plugin-fields';
import { fileLoaderPlugin, FILE_LOADER_PLUGIN } from '@kabel/plugin-file-loader';
import { layoutExtractPlugin, LAYOUT_EXTRACT_PLUGIN } from '@kabel/plugin-layout-extract';
import { llmPlugin, LLM_PLUGIN } from '@kabel/plugin-llm';
import { DEFAULT_LLM_ENDPOINT, DEFAULT_OCR_ENDPOINT, MARKET_FIELD_GROUPS } from '@kabel/plugin-market-supervision';
import { ocrPlugin, OCR_PLUGIN } from '@kabel/plugin-ocr';
import { ocrExcerptPlugin, EXCERPT_PLUGIN } from '@kabel/plugin-ocr-excerpt';
import { regionSelectPlugin, REGION_SELECT_PLUGIN } from '@kabel/plugin-region-select';
import { marketImages } from './market';
import { marketExchange } from './market-api';
import { marketRegulationTable } from './mock/market-regulation';
import { sampleImages } from './scans';

/** 演示里可手动添加的插件。初始配置写在这里，不往插件包里放演示数据。 */
export interface DemoPluginSpec {
  id: string;
  title: string;
  create: () => PluginInput;
  /** 声明了 Config，可在设置 › 插件管理中修改 */
  configurable?: boolean;
}

function pluginSpec(id: string, title: string, create: () => PluginInput): DemoPluginSpec {
  const plugin = create();
  const configurable = !!plugin && typeof plugin === 'object' && !Array.isArray(plugin) && 'Config' in plugin && !!plugin.Config;
  return { id, title, create, configurable };
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
  { id: DATA_TABLE_PLUGIN, title: '数据表格', create: () => dataTablePlugin({ tables: [marketRegulationTable] }) },
];

/**
 * 市场监管场景可增删改的插件。默认加载除「文件加载」以外的全部，
 * 配置与预设一致，但各自独立注册，方便在顶部「插件配置」里增删。
 */
export const marketPlugins: readonly DemoPluginSpec[] = [
  pluginSpec(FIELDS_PLUGIN, '字段模型', () => fieldsPlugin({ groups: MARKET_FIELD_GROUPS as FieldsConfig['groups'] })),
  pluginSpec(CATALOG_PLUGIN, '著录面板', () => catalogPlugin({ region: 'left', title: '档案详情数据', columns: 2 })),
  pluginSpec(OCR_PLUGIN, '文字识别（OCR）', () => ocrPlugin({ endpoint: DEFAULT_OCR_ENDPOINT })),
  pluginSpec(LLM_PLUGIN, '大模型（LLM）', () => llmPlugin({ endpoint: DEFAULT_LLM_ENDPOINT })),
  pluginSpec(REGION_SELECT_PLUGIN, '框选', () => regionSelectPlugin({ panel: false })),
  pluginSpec(EXCERPT_PLUGIN, '框选识别回填', () => ocrExcerptPlugin()),
  pluginSpec(LAYOUT_EXTRACT_PLUGIN, '版面分析自动填充', () => layoutExtractPlugin({ scope: 'group' })),
  pluginSpec(DATA_EXCHANGE_PLUGIN, '数据对接', () => dataExchangePlugin(marketExchange)),
  // 卷内文件目录：左侧下半区（著录面板下方）
  pluginSpec(DATA_TABLE_PLUGIN, '卷内文件目录', () => dataTablePlugin({ tables: [marketRegulationTable] })),
  pluginSpec(FILE_LOADER_PLUGIN, '文件加载', () => fileLoaderPlugin()),
];

/** 首次进入市场监管场景时加载的插件（不含可后加的文件加载） */
export const marketDefaultPluginIds: readonly string[] = marketPlugins
  .map((item) => item.id)
  .filter((id) => id !== FILE_LOADER_PLUGIN);

/** 文件目录固定在右侧，不进入可增删的插件列表 */
const marketFilesPlugin = () =>
  definePlugin({
    name: 'demo:market-files',
    title: '电子文件列表',
    builtin: true,
    setup(ctx) {
      ctx.contribute(ExtensionPoints.panels, {
        id: 'workspace.files',
        region: 'right',
        title: '电子文件列表',
        icon: 'folder',
        order: 10,
        view: FileList,
      });
    },
  });

const STORAGE_KEY = 'kabel-demo:scene-plugins';
const MANAGED_KEY = 'kabel-demo:scene-managed';

function readIdList(key: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return {};
    return Object.fromEntries(
      Object.entries(data).map(([name, value]) => [name, Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []]),
    );
  } catch {
    return {};
  }
}

function readAddedMap(): Record<string, string[]> {
  return readIdList(STORAGE_KEY);
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

/** 用户保存过的插件 id；没保存过时用默认列表。空数组表示用户删光了插件。 */
export function loadManagedPlugins(sceneId: string, defaults: readonly string[], known: readonly string[]): string[] {
  const saved = readIdList(MANAGED_KEY);
  const allow = new Set(known);
  const ids = sceneId in saved ? saved[sceneId] : defaults;
  return (ids ?? []).filter((id) => allow.has(id));
}

export function saveManagedPlugins(sceneId: string, ids: string[]): void {
  const all = readIdList(MANAGED_KEY);
  all[sceneId] = ids;
  localStorage.setItem(MANAGED_KEY, JSON.stringify(all));
}

export function scenePlugins(scene: DemoScene): readonly DemoPluginSpec[] {
  return scene.catalog ?? demoPlugins;
}

export function createScenePlugin(scene: DemoScene, id: string): PluginInput | undefined {
  return scenePlugins(scene).find((item) => item.id === id)?.create();
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
  /** 顶部「插件配置」：可新增、配置、删除其中的插件，并记住选择 */
  catalog?: readonly DemoPluginSpec[];
  /** catalog 场景里，用户还没改过时加载的插件 */
  defaultPluginIds?: readonly string[];
  images: () => ImageSourceInput[];
  layout?: LayoutOptions;
  plugins: () => PluginInput[];
}

const archiveImages = () => sampleImages('关于档案工作的通知');

/** 市场监管场景的栏宽。字段、识别地址和面板位置写在 marketPlugins 里。 */
const marketLayout = { regions: { left: { size: 640, max: 900 }, right: { size: 260 } } } satisfies LayoutOptions;

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
    pluginsLabel: '内置市场监管档案加工，可增删改插件',
    allowAdd: false,
    allowConfig: false,
    catalog: marketPlugins,
    defaultPluginIds: marketDefaultPluginIds,
    images: marketImages,
    layout: marketLayout,
    plugins: () => [marketFilesPlugin()],
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
