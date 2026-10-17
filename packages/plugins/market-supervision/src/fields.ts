import { field, type FieldGroupConfig } from '@kabel/plugin-fields';

type GroupInput = Omit<FieldGroupConfig, 'fields' | 'collapsed'> & { collapsed?: boolean; fields: ReturnType<typeof field>[] };

/** 市场监管档案加工的默认字段分组（可在 设置 › 插件管理 › 字段模型 中增删改） */
export const MARKET_FIELD_GROUPS: GroupInput[] = [
  {
    key: 'subject',
    title: '主体信息',
    fields: [
      field('subjectName', '主体名称/姓名', { required: true, hint: '企业名称或个体经营者姓名' }),
      field('creditCode', '主体证件号码', { required: true, hint: '统一社会信用代码（18 位）或身份证号' }),
      field('regNo', '注册号', { hint: '15 位注册号' }),
      field('fileNo', '户档号'),
      field('subjectType', '主体类型', {
        required: true,
        type: 'select',
        options: '有限责任公司,股份有限公司,个人独资企业,合伙企业,个体工商户,农民专业合作社,分公司',
      }),
      field('currentAuthority', '当前登记机关', { hint: '如“成都市成华区市场监督管理局”' }),
      field('legalPerson', '法定代表人', { more: true }),
      field('address', '住所', { more: true, wide: true }),
      field('capital', '注册资本', { more: true, hint: '含币种与单位，如“100 万元人民币”' }),
      field('foundDate', '成立日期', { more: true, type: 'date' }),
    ],
  },
  {
    key: 'matter',
    title: '事项信息',
    fields: [
      field('archiveType', '档案类型', { type: 'select', options: '登记,备案,注销,其他' }),
      field('mainMatter', '主事项', { required: true, hint: '如“企业登记注册”' }),
      field('matterType', '事项类型', { type: 'select', options: '设立,变更,注销,备案,迁移' }),
      field('changeContent', '变更内容', { hint: '变更登记的事项，设立登记填“不涉及（设立登记）”' }),
      field('changeBefore', '变更前', { more: true, wide: true, type: 'textarea' }),
      field('changeAfter', '变更后', { more: true, wide: true, type: 'textarea' }),
    ],
  },
  {
    key: 'archive',
    title: '档案信息',
    fields: [
      field('authority', '登记机关', { required: true }),
      field('applyDate', '申请日期', { type: 'date' }),
      field('acceptDate', '受理日期', { type: 'date' }),
      field('approveDate', '批准日期', { required: true, type: 'date' }),
      field('paperPages', '纸质档案页数', { type: 'number' }),
      field('licenseNo', '证照编号'),
      field('retention', '保管期限', { type: 'radio', options: '永久,长期,30年,10年' }),
      field('openLevel', '级别设置', { type: 'select', options: '外部一般,内部,受控' }),
    ],
  },
];
