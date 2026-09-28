/**
 * 图标配置，兼容 iconfont.cn 的两种使用方式：
 * - `symbol`（默认）：SVG Symbol 雪碧图，内置一套图标；也可通过 `scriptUrl` 加载宿主 iconfont 项目的 symbol 脚本；
 * - `font`：Font class 模式，渲染 `<i class="iconfont icon-xxx">`，需宿主自行引入字体 CSS。
 */
export interface IconConfig {
  mode?: 'symbol' | 'font';
  /** symbol id / class 前缀，内置为 `kb-icon-`；使用宿主 iconfont 项目时通常为 `icon-` */
  prefix?: string;
  /** font 模式下的基础类名，默认 `iconfont` */
  fontClass?: string;
  /** iconfont 项目的 symbol 脚本地址，如 `//at.alicdn.com/t/c/font_xxx.js` */
  scriptUrl?: string;
  /** 语义名映射：内置名称 -> 宿主图标名，未映射的沿用内置名称 */
  map?: Record<string, string>;
}

export const DEFAULT_ICON_PREFIX = 'kb-icon-';
