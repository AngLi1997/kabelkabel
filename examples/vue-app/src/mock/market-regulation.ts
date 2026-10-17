import type { DataTableConfig } from '@kabel/plugin-data-table';

/**
 * 市场监管场景：企业设立登记档案的“卷内文件目录”。
 * 数据以接口形式提供（`public/mock/market-regulation-materials.json`，返回 `{ code, data: { records, total } }`），
 * 演示 URL 数据源；也可把同样的数组直接作为 `data` 传入。
 */
export const marketRegulationTable: DataTableConfig = {
  id: 'materials',
  title: '卷内文件目录',
  url: '/mock/market-regulation-materials.json',
  pageSize: 10,
  pageSizes: [5, 10, 20],
  columns: [
    { key: 'title', title: '文件题名', mark: 'required' },
    { key: 'responsible', title: '责任者', width: 140, align: 'center' },
    { key: 'date', title: '成文日期', width: 100, align: 'center' },
    { key: 'pages', title: '纸质页号', width: 80, align: 'center' },
  ],
  // 默认即左侧下半区，这里显式写出以示配置方式
  panel: { region: 'left', slot: 'bottom' },
};
