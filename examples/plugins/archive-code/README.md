# 档号生成（示例插件）

插件名 `example:archive-code`，插件管理中显示为“档号生成”，依赖 `kabel:metadata`（文书著录）。根据著录值按规则生成档号并写入指定字段。

规则（示意）：`全宗号-门类·年度-保管期限代码-件号(4 位)`，例如 `J012-WS·2024-Y-0015`。

## 演示点

编译期注册、配置项、依赖声明、命令 + 快捷键、工具栏按钮、状态栏项、通过服务令牌写入其他插件的状态（进入撤销栈）、自定义事件及类型扩充、单元测试。

## 集成

```ts
import { archiveCodePlugin } from '@kabel-examples/plugins/archive-code';

createArchiveEditor('#app', { schema, record, plugins: [archiveCodePlugin({ target: 'archiveCode' })] });
editor.on('archive-code:generated', ({ code }) => console.log(code));
```

```vue
<KabelEditor :schema="schema" :plugins="[archiveCodePlugin()]" />
```

Schema 中需包含 `fonds`（全宗号）、`year`（年度）、`retention`（保管期限）、`itemNo`（件号）以及目标字段。

## 配置 `ArchiveCodeOptions`

| 选项 | 说明 |
| --- | --- |
| `target` | 档号写入的字段，默认 `archiveCode` |
| `category` | 门类代码，默认 `WS`（文书） |
| `retentionCodes` | 保管期限 → 代码，默认 `永久: Y`、`定期30年: D30`、`定期10年: D10` |

## 贡献

| 类型 | id | 说明 |
| --- | --- | --- |
| 命令 | `archiveCode.generate` | 生成档号（`Mod+Shift+G`）；只读或无需更新时禁用 |
| 工具栏 | `archiveCode.generate` | “生成档号”按钮，order 31 |
| 状态栏 | `archiveCode.pending` | 档号待更新时提示，点击生成 |
| 事件 | `archive-code:generated` | `{ code }` |

纯函数 `computeArchiveCode(values, options)` 单独导出，便于在宿主侧复用规则。

## 目录

```
archive-code/
├── README.md
├── src/
│   ├── index.ts      对外导出
│   ├── plugin.ts     插件定义
│   └── rules.ts      档号规则（纯函数，无界面依赖）
└── test/
    └── archive-code.test.ts
```

## 测试

```bash
npx vitest run examples/plugins/archive-code
```
