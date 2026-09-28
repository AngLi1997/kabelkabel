import { describe, expect, it } from 'vitest';
import { normalizeOptions, normalizeRecord, normalizeSchema, validateAll, validateField, requiredProgress } from '../src';

describe('normalizeOptions', () => {
  it('支持字符串数组、对象数组与映射对象', () => {
    expect(normalizeOptions(['永久', '30年'])).toEqual([
      { label: '永久', value: '永久' },
      { label: '30年', value: '30年' },
    ]);
    expect(normalizeOptions([{ label: '公开', value: 0 }])).toEqual([{ label: '公开', value: 0 }]);
    expect(normalizeOptions({ Y: '永久', D30: '定期30年' })).toEqual([
      { label: '永久', value: 'Y' },
      { label: '定期30年', value: 'D30' },
    ]);
  });
});

describe('normalizeSchema', () => {
  const fields = [{ key: 'title', label: '题名', required: true }, { key: 'year', label: '年度', type: 'number' }];

  it('字段数组 → 单分组', () => {
    const schema = normalizeSchema(fields);
    expect(schema.groups).toHaveLength(1);
    expect(schema.fields.title!.type).toBe('text');
    expect(schema.fields.year!.group).toBe('group-0');
  });

  it('{ fields } / { groups } / JSON 字符串结果一致', () => {
    const a = normalizeSchema({ fields });
    const b = normalizeSchema({ groups: [{ title: '基本信息', fields }] });
    const c = normalizeSchema(JSON.stringify({ groups: [{ title: '基本信息', fields }] }));
    expect(Object.keys(a.fields)).toEqual(Object.keys(b.fields));
    expect(c.fields.year!.type).toBe('number');
  });

  it('重复 key 报错', () => {
    expect(() => normalizeSchema([{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }])).toThrow(/duplicate/);
  });
});

describe('normalizeRecord', () => {
  const schema = normalizeSchema([{ key: 'retention', label: '保管期限', defaultValue: '永久' }]);
  it('识别结构化档案与纯值对象', () => {
    expect(normalizeRecord({ id: 1 as unknown as string, values: { a: 1 } })).toEqual({ id: '1', values: { a: 1 } });
    expect(normalizeRecord({ a: 1 })).toEqual({ values: { a: 1 } });
    expect(normalizeRecord('{"values":{"a":2}}')).toEqual({ id: undefined, values: { a: 2 } });
    expect(normalizeRecord(null)).toEqual({ values: {} });
  });
  it('填充默认值但不覆盖已有值', () => {
    expect(normalizeRecord({}, schema).values.retention).toBe('永久');
    expect(normalizeRecord({ retention: '10年' }, schema).values.retention).toBe('10年');
  });
});

describe('validate', () => {
  const schema = normalizeSchema([
    { key: 'title', label: '题名', required: true, maxLength: 5 },
    { key: 'year', label: '年度', type: 'number', min: 1900, max: 2100 },
    { key: 'code', label: '档号', pattern: '^\\d{4}-', message: '档号须以年度开头' },
    { key: 'tags', label: '主题词', type: 'checkbox', required: true },
    { key: 'pages', label: '页数', validator: (v) => (Number(v) > 0 ? null : '页数须大于0') },
  ]);

  it('必填、长度、范围、正则、自定义校验', () => {
    const f = schema.fields;
    expect(validateField(f.title!, '', {})).toBe('请填写题名');
    expect(validateField(f.title!, '超过五个字了', {})).toMatch(/不能超过 5/);
    expect(validateField(f.year!, 1800, {})).toMatch(/不能小于/);
    expect(validateField(f.code!, 'ABC', {})).toBe('档号须以年度开头');
    expect(validateField(f.tags!, [], {})).toBe('请填写主题词');
    expect(validateField(f.pages!, '0', {})).toBe('页数须大于0');
  });

  it('validateAll 与必填进度', () => {
    const values = { title: '会议纪要', tags: ['党建'], pages: 3 };
    expect(validateAll(schema, values)).toEqual({});
    expect(requiredProgress(schema, { title: 'x' })).toEqual({ filled: 1, total: 2 });
  });

  it('类型级校验', () => {
    const errors = validateAll(schema, { title: 'x', tags: ['a'], pages: 1 }, { text: (v) => (v === 'x' ? '非法' : null) });
    expect(errors.title).toBe('非法');
  });
});
