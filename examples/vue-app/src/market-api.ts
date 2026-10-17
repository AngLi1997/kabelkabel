import type { ArchiveEditor } from '@kabel/vue';
import type { DataExchangeConfig, ExchangeData, ExchangePayload } from '@kabel/plugin-data-exchange';
import { MARKET_FIELD_GROUPS } from '@kabel/plugin-market-supervision';

/**
 * 市场监管场景的“业务层”演示：插件只负责导出 / 载入数据，读取与持久化都在这里完成。
 * 加载时优先读取上次提交的数据（localStorage 模拟接口持久化），没有则使用固定变量。
 */

/** 数据对接插件的初始配置：按分组嵌套输出（`subject.subjectName`…），显示全部控件 */
export const marketExchange: Partial<DataExchangeConfig> = {
  controls: ['load', 'import', 'export', 'submit'],
  format: 'json',
  items: ['fields', 'review'],
  fieldsPath: 'archive',
  mapping: MARKET_FIELD_GROUPS.flatMap((group) =>
    group.fields.map((f) => ({ field: f.key ?? '', path: `${group.key}.${f.key}`, submit: true, load: true })),
  ),
};

/** 固定变量：接口尚未返回数据时加载这一份 */
const FIXED_ARCHIVE: ExchangeData = {
  archive: {
    subject: {
      subjectName: '四川星辰信息技术有限公司',
      creditCode: '915101085577261237',
      regNo: '510108000000023',
      subjectType: '有限责任公司',
      currentAuthority: '成都市成华区市场监督管理局',
      legalPerson: '张明',
      address: '成都市成华区建设路 55 号',
      capital: '100 万元人民币',
      foundDate: '2026-08-11',
    },
    matter: {
      archiveType: '登记',
      mainMatter: '企业登记注册',
      matterType: '设立',
      changeContent: '不涉及（设立登记）',
    },
    archive: {
      authority: '成都市成华区市场监督管理局',
      applyDate: '2026-08-11',
      acceptDate: '2026-08-11',
      approveDate: '2026-08-11',
      paperPages: 4,
      retention: '永久',
    },
  },
};

const STORAGE_KEY = 'kabel-demo:market-archive';

/** 模拟接口：读取上次提交的数据 */
async function fetchArchive(): Promise<ExchangeData | string> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // 存储不可用时使用固定变量
  }
  return FIXED_ARCHIVE;
}

/** 模拟接口：提交并持久化 */
async function postArchive(payload: ExchangePayload): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.info(`[host] 提交 ${payload.format.toUpperCase()}\n${payload.text}`);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
}

/** 把业务层接到数据对接插件的事件上 */
export function connectMarketApi(editor: ArchiveEditor): void {
  editor.on('data-exchange:load', () => fetchArchive());
  editor.on('data-exchange:submit', (payload) => postArchive(payload));
}
