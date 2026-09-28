import { definePlugin, ExtensionPoints } from '@kabel/editor';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, inject, nextTick, ref } from 'vue';
import { KabelEditor, KabelPanel, KabelToolbarButton, useKabelState, vueView } from '../src';

const schema = [{ key: 'title', label: '题名', required: true }];
const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((r) => setTimeout(r));
    await nextTick();
  }
};

const wrappers: { unmount(): void }[] = [];
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
const mountTracked: typeof mount = ((...args: Parameters<typeof mount>) => {
  const w = mount(...args);
  wrappers.push(w);
  return w;
}) as typeof mount;

describe('<KabelEditor>', () => {
  it('挂载工作台并通过 v-model:record 回传修改', async () => {
    const onUpdate = vi.fn();
    const wrapper = mountTracked(KabelEditor, {
      attachTo: document.body,
      props: { schema, record: { title: '原' }, storage: 'memory', 'onUpdate:record': onUpdate },
    });
    await flush();
    expect(wrapper.find('.kb-root').exists()).toBe(true);
    const editor = (wrapper.vm as unknown as { getEditor(): import('@kabel/editor').ArchiveEditor }).getEditor();
    editor.setValue('title', '新');
    expect(onUpdate).toHaveBeenLastCalledWith({ values: { title: '新' } });
  });

  it('@save 返回的 Promise 被等待', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => (resolveSave = r)));
    const onSaved = vi.fn();
    const wrapper = mountTracked(KabelEditor, {
      attachTo: document.body,
      props: { schema, record: { title: 'x' }, storage: 'memory', onSave, onSaved },
    });
    await flush();
    const pending = (wrapper.vm as unknown as { save(): Promise<{ ok: boolean }> }).save();
    await flush();
    expect(onSave).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    resolveSave();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(onSaved).toHaveBeenCalled();
  });

  it('外部修改 record 时同步到编辑器', async () => {
    const wrapper = mountTracked(KabelEditor, { attachTo: document.body, props: { schema, record: { title: 'a' }, storage: 'memory' } });
    await flush();
    await wrapper.setProps({ record: { id: '2', values: { title: 'b' } } });
    const editor = (wrapper.vm as unknown as { getEditor(): import('@kabel/editor').ArchiveEditor }).getEditor();
    expect(editor.getRecord()).toEqual({ id: '2', values: { title: 'b' } });
  });
});

describe('<KabelPanel> / <KabelToolbarButton> / vueView', () => {
  it('Vue 插槽内容 Teleport 到右侧区域，并保留宿主 provide', async () => {
    const onClick = vi.fn();
    const Child = defineComponent({
      setup() {
        const theme = inject('host-theme');
        const dirty = useKabelState((s) => s.history.dirty, false);
        return () => h('div', { class: 'host-child' }, `${theme}|${dirty.value}`);
      },
    });
    const App = defineComponent({
      provide: { 'host-theme': 'gov' },
      setup() {
        const count = ref(0);
        return () =>
          h(KabelEditor, { schema, storage: 'memory', inspector: false }, () => [
            h(KabelPanel, { id: 'host.panel', region: 'right', title: '关联文件' }, () => [h(Child), h('span', { class: 'count' }, count.value)]),
            h(KabelToolbarButton, { id: 'host.submit', label: '提交审核', icon: 'submit', onClick }),
          ]);
      },
    });
    const wrapper = mountTracked(App, { attachTo: document.body });
    await flush();
    const region = wrapper.find('[data-region="right"]');
    expect(region.exists()).toBe(true);
    expect(region.find('.host-child').text()).toBe('gov|false');
    const button = wrapper.findAll('button').find((b) => b.text() === '提交审核');
    await button!.trigger('click');
    expect(onClick).toHaveBeenCalled();
  });

  it('vueView 将 Vue 组件作为插件面板渲染，并继承 appContext', async () => {
    const Panel = defineComponent({
      props: { panelId: String },
      setup(props) {
        return () => h('p', { class: 'vue-view' }, props.panelId);
      },
    });
    const plugin = definePlugin({
      name: 'host:vue-view',
      setup(ctx) {
        ctx.contribute(ExtensionPoints.panels, { id: 'host.view', region: 'left', title: 'Vue 面板', view: vueView(Panel) });
      },
    });
    const wrapper = mountTracked(KabelEditor, { attachTo: document.body, props: { schema, storage: 'memory', viewer: false, plugins: plugin } });
    await flush();
    expect(wrapper.find('.vue-view').text()).toBe('host.view');
  });
});
