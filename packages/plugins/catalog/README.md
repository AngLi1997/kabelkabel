# @kabel/plugin-catalog · 著录面板（业务插件）

按字段模型的分组渲染“档案详情数据”：分组可折叠、“更多字段”按需展开、必填标记、校验错误、值的来源（“识别填入”“AI 已填入 · 待复核 / 确认”）与证据定位。它只是字段模型的**一个视图**——值由谁写入（人工、框选识别、版面分析、宿主）都在这里显示。

插件名 `kabel:catalog`，`inject: [FIELDS_SERVICE]`（需要 `@kabel/plugin-fields`）。

## 集成

```ts
import { catalogPlugin } from '@kabel/plugin-catalog';
import { fieldsPlugin } from '@kabel/plugin-fields';

createArchiveEditor(el, { plugins: [fieldsPlugin({ groups }), catalogPlugin({ region: 'left', columns: 2 })] });
// 样式已包含在 @kabel/editor/style.css 中
```

## 配置

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `title` | `档案详情数据` | 面板标题 |
| `region` | `right` | 面板位置：`left` / `main` / `right` |
| `columns` | `2` | 字段列数；面板宽度不足 560px 时自动单列（容器查询） |
| `order` | `10` | 排序 |

## 交互

- 单行控件中 `Enter` 下一个字段、`Shift+Enter` 上一个；任意位置 `Ctrl+↓` / `Ctrl+↑`（字段模型命令）。
- 焦点由字段模型驱动：框选识别、校验失败等改变当前字段时，面板展开所在分组 / “更多字段”并把输入焦点移过去。
- 机器填写且待复核的值以警示色显示，点“确认”完成复核；有影像证据的字段显示“定位”（执行 `workspace.reveal`）。
- 字段名旁的操作按钮来自扩展点 `FieldExtensions.actions`（如框选识别），悬停或选中字段时显示。
- 只读模式下控件只读，操作按钮隐藏。

## 命令与贡献

| 项 | 说明 |
| --- | --- |
| 面板 `catalog.panel` | 头部操作：校验、全部确认、整体收起 / 展开 |
| 命令 `catalog.toggleAll` | 整体收起 / 展开 |
| 状态栏 `catalog.progress` | “必填 5/6 · 待复核 2”，点击全部确认 |

## 状态

切片 `catalog`（不入撤销）：`collapsed`、`more`。

## 样式

类名前缀 `kb-catalog`。
