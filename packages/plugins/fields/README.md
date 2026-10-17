# @kabel/plugin-fields · 字段模型（能力插件）

所有“读写字段值”的插件的汇合点：字段分组配置、字段值（带**来源**、**复核状态**、**影像证据**）、焦点与校验。著录面板、框选识别、版面分析、宿主都通过同一个服务 `FIELDS_SERVICE` 协作，彼此不知道对方存在。

插件名 `kabel:fields`，不依赖其他插件。

## 集成

```ts
import { fieldsPlugin, field } from '@kabel/plugin-fields';

createArchiveEditor(el, {
  plugins: [
    fieldsPlugin({
      groups: [
        { key: 'subject', title: '主体信息', fields: [field('name', '主体名称', { required: true }), field('type', '主体类型', { type: 'select', options: '有限责任公司,个体工商户' })] },
      ],
    }),
  ],
});
```

工厂参数是**注册方配置**；用户在 设置 › 插件管理 › 字段模型 › 配置 中保存的配置优先（持久化），保存后插件重载，已填写的字段值保留。

## 配置（`Config`）

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `groups` | `[]` | 字段分组：`{ key, title, collapsed, fields }`，在设置中以“分组卡片 + 字段表格”编辑 |
| `groups[].fields[]` | — | `key` 标识、`label` 名称、`type`（`text` / `textarea` / `date` / `number` / `select` / `radio` / `checkbox`）、`required` 必填、`options` 可选值（逗号分隔）、`wide` 整行、`more` 折叠在“更多字段”、`hint` 提取提示（给智能提取） |
| `validateOnSave` | `true` | 保存前校验必填：未通过时否决 `save` 并定位到第一个错误字段 |

`field(key, label, extra)` 是书写配置行的辅助函数。

## 服务 `FIELDS_SERVICE`

| 方法 | 说明 |
| --- | --- |
| `groups()` / `fields()` / `field(key)` | 字段定义 |
| `get(key)` | `FieldValue`：`{ value, source, review?, evidence?, confidence? }` |
| `values()` | 纯值快照（保存用） |
| `set(key, value, { source, review, evidence, label })` | 写入一个字段。机器来源（`ocr` / `ai` / `host`）按类型规整：日期 → `YYYY-MM-DD`，数字取数值，选项匹配可选值，单行文本去换行；人工输入（`user`，默认）原样保存，连续输入合并为一条撤销记录 |
| `setMany(entries, options)` | 一次写入多个字段，合并为一条撤销记录，返回实际变化的键 |
| `load(values)` | 宿主载入一份档案（来源 `host`，不入撤销栈并清空撤销历史） |
| `confirm(key)` / `confirmAll()` / `pending()` | 复核 |
| `focus(key)` / `focused()` / `next()` / `prev()` | 当前字段 |
| `validate()` | 校验必填与正则，结果写入 `state.fieldsView.errors` |
| `normalize(key, value)` | 只规整不写入 |

值的来源是一等数据：“AI 已填入 · 待复核”“识别填入”“必填 7/9”都由 `state.fields` 派生，任何插件都能计算。

## 事件

| 事件 | 载荷 |
| --- | --- |
| `field:change` | `{ key, value, prev, source }` |
| `field:focus` | `{ key }` |

## 命令

| 命令 | 快捷键 | 说明 |
| --- | --- | --- |
| `fields.next` / `fields.prev` | `Mod+↓` / `Mod+↑` | 下一个 / 上一个字段 |
| `fields.validate` | — | 校验并定位到第一个错误 |
| `fields.confirmAll` | — | 全部确认（复核） |
| `fields.focus` / `fields.confirm` | — | 带参数（字段 key），隐藏 |

## 扩展点

`FieldExtensions.actions`：字段操作按钮 `{ id, icon, title, command, when?(field) }`，由著录面板显示在字段名旁，点击执行命令、参数为字段 key（框选识别的“框选识别”按钮即由此贡献）。

## 状态

- `state.fields`（`history: true`）：`{ values }`；
- `state.fieldsView`（不入撤销）：`{ groups, focus, errors }`。
