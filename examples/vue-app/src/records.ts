import type { ArchiveRecord } from '@kabel/vue';

/** 模拟宿主系统中的待著录档案 */
export const records: ArchiveRecord[] = [
  {
    id: 'WS-2024-0015',
    values: {
      fonds: 'J012',
      year: 2024,
      retention: '永久',
      org: 'BGS',
      itemNo: 15,
      title: '关于开展2024年度档案工作年检的通知',
      author: '示例市档案局',
      docNo: '示档发〔2024〕11号',
      docDate: '20240308',
      pages: 4,
      carrier: ['纸质', '电子'],
      cataloger: '李明',
    },
  },
  {
    id: 'WS-2024-0016',
    values: { fonds: 'J012', year: 2024, retention: '定期30年', itemNo: 16, author: '示例市档案局', pages: 2 },
  },
  { id: 'WS-2024-0017', values: { fonds: 'J012', year: 2024 } },
];
