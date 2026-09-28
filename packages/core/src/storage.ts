/** 持久化适配器，兼容 Web Storage 接口；宿主可接入 IndexedDB、服务端等实现 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageInput = StorageAdapter | 'local' | 'session' | 'memory' | false;

export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const noopStorage: StorageAdapter = { getItem: () => null, setItem() {}, removeItem() {} };

export function resolveStorage(input: StorageInput | undefined = 'local'): StorageAdapter {
  if (input === false) return noopStorage;
  if (input === 'memory') return createMemoryStorage();
  if (input === 'local' || input === 'session') {
    try {
      const storage = input === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
      const probe = '__kabel_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return createMemoryStorage();
    }
  }
  return input;
}

/** 带命名空间与 JSON 序列化的存储视图，读写异常不会抛出 */
export class ScopedStorage {
  constructor(
    private readonly adapter: StorageAdapter,
    readonly namespace: string,
  ) {}

  scope(name: string): ScopedStorage {
    return new ScopedStorage(this.adapter, `${this.namespace}:${name}`);
  }

  get<T>(key: string, fallback: T): T {
    try {
      const raw = this.adapter.getItem(this.key(key));
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    try {
      this.adapter.setItem(this.key(key), JSON.stringify(value));
    } catch {
      /* 存储已满或被禁用时静默失败 */
    }
  }

  remove(key: string): void {
    try {
      this.adapter.removeItem(this.key(key));
    } catch {
      /* ignore */
    }
  }

  private key(key: string) {
    return `${this.namespace}:${key}`;
  }
}
