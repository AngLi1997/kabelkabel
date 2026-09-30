import type { FileEntry } from './contract';

interface DirHandle {
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
}
interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

const isDir = (h: DirHandle | FileHandle): h is DirHandle => (h as { kind?: string }).kind === 'directory';

async function walk(dir: DirHandle, parent: string, out: FileEntry[]) {
  for await (const handle of dir.values()) {
    if (isDir(handle)) await walk(handle, parent ? `${parent}/${handle.name}` : handle.name, out);
    else out.push({ name: handle.name, group: parent || undefined, file: await handle.getFile() });
  }
}

/** 由 `File`（含 `webkitRelativePath`）生成条目；相对路径去掉最外层目录名后作为分组 */
export function entriesFromFiles(files: Iterable<File>): FileEntry[] {
  return Array.from(files, (file) => {
    const segments = (file.webkitRelativePath || '').split('/').filter(Boolean);
    const group = segments.length > 2 ? segments.slice(1, -1).join('/') : undefined;
    return { name: file.name, group, file };
  });
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** 兜底：`<input webkitdirectory>`，用于不支持 File System Access API 的浏览器 */
function pickWithInput(): Promise<FileEntry[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    const done = (value: FileEntry[] | null) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => done(input.files?.length ? entriesFromFiles(Array.from(input.files)) : null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 打开本地目录并递归读取全部文件。优先使用 `showDirectoryPicker`（Chromium，仅安全上下文），
 * 否则回退到 `<input webkitdirectory>`。用户取消返回 null。必须在点击等用户手势中调用。
 */
export async function pickDirectory(): Promise<FileEntry[] | null> {
  const picker = (globalThis as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
  if (!picker) return pickWithInput();
  try {
    const root = await picker.call(globalThis, { mode: 'read' });
    const out: FileEntry[] = [];
    await walk(root, '', out);
    return out;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}
