# 主题、样式与图标

## 样式隔离

- 全部样式挂在 `.kb-root` 之下，类名统一 `kb-` 前缀；不包含任何全局选择器（`html`、`body`、`*`）。
- 盒模型、字体、`[hidden]` 等基础重置只作用于 `.kb-root` 子树。
- 唯一写入 `document` 的内容是一个隐藏的 `<svg>` 图标雪碧图（与 iconfont.cn 的 symbol 脚本做法相同）。

引入：

```ts
import '@kabel/vue/style.css';       // 或 '@kabel/editor/style.css'
```

按需组合时，也可分别引入 `@kabel/ui/style.css` 与各插件的 `style.css`。

## 设计令牌

默认主题为企业/政务风格：藏蓝主色、2px 圆角、13px 正文、28px 控件高度。所有颜色与尺寸均为 CSS 变量，定义在 `.kb-root` 上，覆盖即可换肤：

```css
.my-host .kb-root {
  --kb-color-primary: #a4262c;          /* 主色 */
  --kb-color-primary-hover: #b8323a;
  --kb-color-primary-active: #8c1f25;
  --kb-color-primary-soft: #f8ecec;
  --kb-font-size: 14px;
  --kb-control-height: 30px;
  --kb-label-width: 110px;
}
```

| 类别 | 变量 |
| --- | --- |
| 品牌与语义色 | `--kb-color-primary(-hover/-active/-soft)`、`--kb-color-danger(-soft)`、`--kb-color-warning(-soft)`、`--kb-color-success(-soft)` |
| 文字 | `--kb-color-text`、`--kb-color-text-2`、`--kb-color-text-disabled`、`--kb-color-icon` |
| 背景与边框 | `--kb-color-bg`、`--kb-color-surface`、`--kb-color-surface-2`、`--kb-color-hover`、`--kb-color-border`、`--kb-color-border-strong`、`--kb-color-divider`、`--kb-color-canvas`（影像底色） |
| 排版 | `--kb-font-family`、`--kb-font-size`、`--kb-font-size-sm`、`--kb-line-height` |
| 尺寸 | `--kb-radius`、`--kb-control-height(-sm)`、`--kb-toolbar-height`、`--kb-header-height`、`--kb-statusbar-height`、`--kb-label-width`、`--kb-space-1…4` |
| 其他 | `--kb-shadow-overlay`、`--kb-focus-ring`、`--kb-transition` |

主题插件（后续版本）即是在运行期切换一组变量；当前版本提供一套默认主题。插件与宿主面板的自定义样式也应使用这些变量，以保持一致（示例 `examples/vue-app/src/components/RecordList.vue`）。

## Tailwind（可选）

```js
// tailwind.config.js
module.exports = { presets: [require('@kabel/ui/tailwind-preset')] };
```

之后可在插件/宿主面板中使用 `bg-kb-primary`、`text-kb-text`、`border-kb-border`、`rounded-kb`、`h-kb-control` 等类名，它们指向同一组 CSS 变量。

## 图标（iconfont）

内置一套 24×24 线性图标，以 iconfont Symbol 格式注入。名称：

`save undo redo validate chevron-left/right/up/down fold-left fold-right panel-left panel-right maximize restore close zoom-in zoom-out fit actual-size rotate-left rotate-right image grid file list history warning error success info reset unfold fold more plus minus submit link folder tag hash search layout arrow-up arrow-down edit eye`

### 使用宿主的 iconfont 项目

**Symbol 模式**（推荐，与 iconfont.cn “Symbol” 导出一致）：

```ts
createArchiveEditor(el, {
  icons: {
    scriptUrl: '//at.alicdn.com/t/c/font_xxxxx.js',   // 自动加载
    prefix: 'icon-',
    map: { save: 'baocun', undo: 'chexiao' },          // 内置名 → 项目图标名；未映射的回退内置图标
  },
});
```

**Font class 模式**（宿主已引入 iconfont.css）：

```ts
icons: { mode: 'font', fontClass: 'iconfont', prefix: 'icon-', map: { save: 'baocun' } }
// 渲染为 <i class="kb-icon iconfont icon-baocun">
```

插件中使用图标：贡献项的 `icon` 字段填名称；组件中 `<Icon name="hash" />`。
