import type { ArchiveEditor, KabelState } from '@kabel/editor';
import { inject, onScopeDispose, shallowRef, watch, type ShallowRef } from 'vue';
import { KABEL_CONTEXT } from './context';

/** 在 <KabelEditor> 子组件中获取编辑器实例（挂载完成前为 null） */
export function useKabel(): ShallowRef<ArchiveEditor | null> {
  const ctx = inject(KABEL_CONTEXT, null);
  if (!ctx) throw new Error('[kabel] useKabel() must be used inside <KabelEditor>');
  return ctx.editor;
}

/**
 * 以响应式方式订阅编辑器状态。
 *
 * ```ts
 * const dirty = useKabelState((s) => s.history.dirty, false);
 * ```
 */
export function useKabelState<T>(selector: (state: KabelState) => T, fallback: T, editor = useKabel()): ShallowRef<T> {
  const value = shallowRef<T>(fallback);
  let stop: (() => void) | undefined;
  watch(
    editor,
    (instance) => {
      stop?.();
      stop = undefined;
      if (!instance) {
        value.value = fallback;
        return;
      }
      const read = () => {
        try {
          return selector(instance.getState());
        } catch {
          return fallback;
        }
      };
      value.value = read();
      stop = instance.subscribe(() => {
        const next = read();
        if (!Object.is(next, value.value)) value.value = next;
      });
    },
    { immediate: true },
  );
  onScopeDispose(() => stop?.());
  return value;
}
