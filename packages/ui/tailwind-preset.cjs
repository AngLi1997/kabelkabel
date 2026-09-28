/**
 * 可选 Tailwind 预设：将 Kabel 设计令牌映射为 Tailwind 主题，
 * 便于宿主或插件使用 `bg-kb-primary`、`text-kb-text` 等类名保持视觉一致。
 *
 *   // tailwind.config.js
 *   module.exports = { presets: [require('@kabel/ui/tailwind-preset')] }
 */
const v = (name) => `var(--kb-${name})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        kb: {
          primary: v('color-primary'),
          'primary-hover': v('color-primary-hover'),
          'primary-soft': v('color-primary-soft'),
          danger: v('color-danger'),
          warning: v('color-warning'),
          success: v('color-success'),
          text: v('color-text'),
          'text-2': v('color-text-2'),
          border: v('color-border'),
          divider: v('color-divider'),
          surface: v('color-surface'),
          'surface-2': v('color-surface-2'),
          bg: v('color-bg'),
        },
      },
      borderRadius: { kb: v('radius') },
      fontSize: { kb: v('font-size'), 'kb-sm': v('font-size-sm') },
      height: { 'kb-control': v('control-height'), 'kb-control-sm': v('control-height-sm') },
      fontFamily: { kb: v('font-family') },
    },
  },
};
