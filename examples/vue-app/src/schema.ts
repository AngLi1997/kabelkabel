import type { MetadataSchema } from '@kabel/vue';

/** 文书档案著录项（参照 DA/T 22 归档文件整理规则，示意） */
export const documentSchema: MetadataSchema = {
  id: 'ws-document',
  columns: 2,
  labelWidth: 96,
  groups: [
    {
      key: 'archive',
      title: '档号信息',
      fields: [
        { key: 'fonds', label: '全宗号', required: true, pattern: '^[A-Z]\\d{3}$', message: '全宗号为 1 位字母 + 3 位数字' },
        { key: 'year', label: '年度', type: 'number', required: true, min: 1949, max: 2100 },
        { key: 'retention', label: '保管期限', type: 'select', required: true, options: ['永久', '定期30年', '定期10年'] },
        { key: 'org', label: '机构（问题）', type: 'select', options: { BGS: '办公室', ZCK: '政策法规科', JDK: '监督指导科' } },
        { key: 'itemNo', label: '件号', type: 'number', required: true, min: 1 },
        { key: 'archiveCode', label: '档号', readonly: true, placeholder: '由“生成档号”自动生成' },
      ],
    },
    {
      key: 'content',
      title: '内容描述',
      fields: [
        { key: 'title', label: '题名', required: true, span: 'full', maxLength: 200 },
        { key: 'author', label: '责任者', required: true },
        { key: 'docNo', label: '文号' },
        { key: 'docDate', label: '成文日期', type: 'date', required: true, props: { valueFormat: 'YYYYMMDD' } },
        { key: 'pages', label: '页数', type: 'number', min: 1 },
        {
          key: 'secret',
          label: '密级',
          type: 'select',
          defaultValue: '公开',
          options: [
            { label: '公开', value: '公开' },
            { label: '内部', value: '内部' },
            { label: '秘密', value: '秘密' },
            { label: '机密', value: '机密' },
          ],
        },
        { key: 'keywords', label: '主题词' },
        { key: 'remark', label: '附注', type: 'textarea', span: 'full', maxLength: 500 },
      ],
    },
    {
      key: 'manage',
      title: '管理信息',
      collapsed: false,
      fields: [
        { key: 'openStatus', label: '开放状态', type: 'radio', options: ['开放', '控制'], defaultValue: '控制' },
        { key: 'carrier', label: '载体形式', type: 'checkbox', options: ['纸质', '电子', '照片', '音视频'] },
        { key: 'cataloger', label: '著录人' },
        { key: 'catalogDate', label: '著录日期', type: 'date' },
      ],
    },
  ],
};
