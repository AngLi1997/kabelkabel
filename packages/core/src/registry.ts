import { toDisposable, type Disposable, type Unsubscribe } from './utils';

export interface Contribution {
  id: string;
  /** 排序值，越小越靠前，默认 100 */
  order?: number;
}

/** 扩展点声明。类型参数描述贡献项的结构。 */
export interface ExtensionPoint<T extends Contribution> {
  readonly id: string;
  /** 仅用于类型推导 */
  readonly __item?: T;
}

export function defineExtensionPoint<T extends Contribution>(id: string): ExtensionPoint<T> {
  return Object.freeze({ id }) as ExtensionPoint<T>;
}

/**
 * 某个扩展点下的贡献项集合。相同 id 的后注册项会覆盖先注册项，
 * 释放覆盖项后自动恢复被覆盖的项（便于宿主替换内置按钮/面板）。
 */
export class ContributionRegistry<T extends Contribution> {
  private entries: { item: T; seq: number }[] = [];
  private sorted: readonly T[] | null = null;
  private listeners = new Set<() => void>();
  private seq = 0;

  add(item: T): Disposable {
    const entry = { item, seq: ++this.seq };
    this.entries.push(entry);
    this.changed();
    return toDisposable(() => {
      const index = this.entries.indexOf(entry);
      if (index < 0) return;
      this.entries.splice(index, 1);
      this.changed();
    });
  }

  /** 返回按 order 排序、按 id 去重（后注册者优先）的列表。结果在两次变更之间保持同一引用。 */
  getAll(): readonly T[] {
    if (this.sorted) return this.sorted;
    const byId = new Map<string, { item: T; seq: number }>();
    for (const entry of this.entries) byId.set(entry.item.id, entry);
    const list = [...byId.values()].sort(
      (a, b) => (a.item.order ?? 100) - (b.item.order ?? 100) || a.seq - b.seq,
    );
    this.sorted = Object.freeze(list.map((e) => e.item));
    return this.sorted;
  }

  get(id: string): T | undefined {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (this.entries[i]!.item.id === id) return this.entries[i]!.item;
    }
    return undefined;
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    this.sorted = null;
    for (const listener of [...this.listeners]) listener();
  }
}

export class ExtensionRegistry {
  private registries = new Map<string, ContributionRegistry<any>>();

  get<T extends Contribution>(point: ExtensionPoint<T>): ContributionRegistry<T> {
    let registry = this.registries.get(point.id);
    if (!registry) {
      registry = new ContributionRegistry<T>();
      this.registries.set(point.id, registry);
    }
    return registry;
  }

  contribute<T extends Contribution>(point: ExtensionPoint<T>, item: T): Disposable {
    return this.get(point).add(item);
  }
}
