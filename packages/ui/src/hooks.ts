import type { Contribution, ExtensionPoint, KabelState, Kernel } from '@kabel/core';
import type { RefObject } from 'preact';
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import { KernelContext, UiConfigContext } from './context';

export function useKernel(): Kernel {
  const kernel = useContext(KernelContext);
  if (!kernel) throw new Error('[kabel] useKernel must be used inside <Workbench>');
  return kernel;
}

export const useUiConfig = () => useContext(UiConfigContext);

const forceReducer = (n: number) => n + 1;

/** 订阅状态切片；仅当选择结果变化（默认 Object.is）时重新渲染 */
export function useSelector<T>(selector: (state: KabelState) => T, equals: (a: T, b: T) => boolean = Object.is): T {
  const kernel = useKernel();
  const [, force] = useReducer(forceReducer, 0);
  const value = selector(kernel.store.getState());
  const latest = useRef({ selector, equals, value });
  latest.current = { selector, equals, value };
  useLayoutEffect(
    () =>
      kernel.store.subscribe((state) => {
        const { selector: sel, equals: eq, value: prev } = latest.current;
        let next: T;
        try {
          next = sel(state);
        } catch {
          force(0);
          return;
        }
        if (!eq(next, prev)) force(0);
      }),
    [kernel],
  );
  return value;
}

/** 任意状态变化都重新渲染，适用于基于谓词函数求值的小型组件（工具栏、状态栏） */
export function useStoreState(): KabelState {
  return useSelector((s) => s);
}

/** 订阅扩展点贡献项 */
export function useContributions<T extends Contribution>(point: ExtensionPoint<T>): readonly T[] {
  const kernel = useKernel();
  const registry = kernel.extensions.get(point);
  const [, force] = useReducer(forceReducer, 0);
  useLayoutEffect(() => registry.subscribe(() => force(0)), [registry]);
  return registry.getAll();
}

/** 命令注册表变化时重新渲染 */
export function useCommandsVersion(): void {
  const kernel = useKernel();
  const [, force] = useReducer(forceReducer, 0);
  useLayoutEffect(() => kernel.commands.subscribe(() => force(0)), [kernel]);
}

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize(ref: RefObject<HTMLElement>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

import type { Breakpoint } from './layout/layout-plugin';
export type { Breakpoint };

/** 基于容器宽度（而非视口）判断断点，保证嵌入任意宿主页面时表现一致 */
export function breakpointOf(width: number): Breakpoint {
  if (width === 0) return 'lg';
  if (width < 720) return 'sm';
  if (width < 1100) return 'md';
  return 'lg';
}

/** 订阅媒体查询；enabled 为 false 时不监听并返回 false */
export function useMediaQuery(query: string, enabled = true): boolean {
  const get = () => enabled && typeof matchMedia === 'function' && matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    setMatches(get());
    if (!enabled || typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query, enabled]);
  return matches;
}

export function useEvent<K extends string>(type: K, handler: (payload: any) => void): void {
  const kernel = useKernel();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => kernel.bus.on(type, (p) => ref.current(p)), [kernel, type]);
}
