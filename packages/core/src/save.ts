import { ExtensionPoints } from './contributions';
import { NOTIFY_SERVICE } from './feedback';
import { definePlugin } from './plugin';
import { createSlice } from './store';

export interface SaveState {
  saving: boolean;
  /** 最近一次保存成功的时间戳 */
  savedAt: number | null;
  error: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error?: unknown };

export const saveSlice = createSlice({
  name: 'save',
  initialState: { saving: false, savedAt: null, error: null } as SaveState,
  reducers: {
    start: (s: SaveState) => ({ ...s, saving: true, error: null }),
    done: (_s: SaveState, savedAt: number) => ({ saving: false, savedAt, error: null }),
    fail: (s: SaveState, error: string) => ({ ...s, saving: false, error }),
  },
});

export const saveActions = saveSlice.actions;

export interface SavePluginOptions {
  /** 有未保存修改时离开页面是否弹出浏览器确认，默认 true */
  confirmLeave?: boolean;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : typeof error === 'string' ? error : '保存失败');

/**
 * 保存契约：`kabel.save` 命令（Mod+S）依次等待所有 `save` 事件处理器（emitAsync），
 * 全部成功后标记撤销栈保存点并派发 `saved`；任一处理器 reject 则派发 `save:error`。
 * 底座只管流程，保存什么、存到哪里由业务插件或宿主在 `save` 事件里实现。
 */
export const savePlugin = (options: SavePluginOptions = {}) =>
  definePlugin({
    name: 'kabel:save',
    title: '保存',
    builtin: true,
    setup(ctx) {
      const { kernel } = ctx;
      ctx.registerSlice(saveSlice);
      ctx.registerCommand({
        id: 'kabel.save',
        title: '保存',
        icon: 'save',
        keybinding: 'Mod+S',
        mutates: true,
        enabled: (k) => !k.getState().save?.saving,
        run: async (k, reason?: string): Promise<SaveResult> => {
          const payload = { reason: typeof reason === 'string' ? reason : 'manual' };
          k.dispatch(saveActions.start());
          try {
            await k.bus.emitAsync('save', payload);
            k.history.markSaved();
            k.dispatch(saveActions.done(Date.now()));
            k.bus.emit('saved', payload);
            return { ok: true };
          } catch (error) {
            k.dispatch(saveActions.fail(messageOf(error)));
            k.bus.emit('save:error', { error });
            k.services.tryGet(NOTIFY_SERVICE)?.notify(`保存失败：${messageOf(error)}`, { type: 'error' });
            return { ok: false, error };
          }
        },
      });

      // 有人监听 save（或已有未保存修改）时才显示保存按钮
      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'save.save',
        icon: 'save',
        label: '保存',
        tooltip: '保存',
        command: 'kabel.save',
        order: 10,
        when: (s, k) => k.bus.listenerCount('save') > 0 || s.history.dirty,
      });
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'save.status',
        align: 'left',
        order: 2,
        text: (s) => (s.save?.saving ? '保存中…' : s.save?.error ? '保存失败' : s.history.dirty ? '未保存' : null),
        tone: (s) => (s.save?.error ? 'danger' : s.save?.saving ? 'default' : 'warning'),
        tooltip: '有未保存的修改',
      });

      const confirmLeave = options.confirmLeave !== false && typeof window !== 'undefined';
      if (confirmLeave) {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
          if (!kernel.getState().history.dirty) return;
          event.preventDefault();
          event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        ctx.onDispose(() => window.removeEventListener('beforeunload', onBeforeUnload));
      }
    },
  });
