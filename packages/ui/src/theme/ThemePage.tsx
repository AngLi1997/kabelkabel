import type { SettingsPageProps } from '@kabel/core';
import type { ComponentChildren } from 'preact';
import { Button } from '../components/Button';
import { Segmented } from '../components/form';
import { useSelector } from '../hooks';
import { cx } from '../utils';
import { DEFAULT_ACCENTS, FONT_SIZES, THEME_ACCENTS, themeActions, type ThemeState } from './theme-plugin';

function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="kb-setting-row">
      <span class="kb-setting-row__label">{label}</span>
      <div class="kb-setting-row__control">{children}</div>
    </div>
  );
}

export function ThemePage({ kernel }: SettingsPageProps) {
  const theme = useSelector((s) => s.theme);
  const accents = kernel.services.tryGet(THEME_ACCENTS) ?? DEFAULT_ACCENTS;
  const set = (patch: Partial<ThemeState>) => kernel.dispatch(themeActions.set(patch));
  if (!theme) return null;
  // 默认主色存为 null，跟随令牌中的默认值
  const defaultColor = DEFAULT_ACCENTS[0]!.color;
  const current = (theme.accent ?? defaultColor).toLowerCase();

  return (
    <div class="kb-setting-list">
      <Row label="配色方案">
        <Segmented
          label="配色方案"
          value={theme.scheme}
          onChange={(scheme) => set({ scheme })}
          options={[
            { label: '浅色', value: 'light' },
            { label: '深色', value: 'dark' },
            { label: '跟随系统', value: 'system' },
          ]}
        />
      </Row>
      <Row label="主题色">
        <div class="kb-swatches" role="radiogroup" aria-label="主题色">
          {accents.map((accent) => {
            const selected = accent.color.toLowerCase() === current;
            return (
              <button
                key={accent.color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={accent.title}
                title={accent.title}
                class={cx('kb-swatch', selected && 'is-active')}
                style={{ '--kb-swatch': accent.color }}
                onClick={() => set({ accent: accent.color.toLowerCase() === defaultColor ? null : accent.color })}
              />
            );
          })}
        </div>
      </Row>
      <Row label="界面密度">
        <Segmented
          label="界面密度"
          value={theme.density}
          onChange={(density) => set({ density })}
          options={[
            { label: '紧凑', value: 'compact' },
            { label: '标准', value: 'standard' },
            { label: '宽松', value: 'comfortable' },
          ]}
        />
      </Row>
      <Row label="字号">
        <Segmented
          label="字号"
          value={theme.fontSize}
          onChange={(fontSize) => set({ fontSize })}
          options={FONT_SIZES.map((size) => ({ label: `${size}px`, value: size as number }))}
        />
      </Row>
      <Row label="">
        <Button icon="reset" onClick={() => kernel.execute('theme.reset')}>
          恢复默认
        </Button>
      </Row>
    </div>
  );
}
