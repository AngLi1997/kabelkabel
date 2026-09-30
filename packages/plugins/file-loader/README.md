# @kabel/plugin-file-loader

文件加载插件：把 **MinIO 桶+路径**、**本地目录**、**URL 列表**中的影像批量交给工作台，自动显示到影像舞台。只依赖 `kabel:workspace`，通过 `WORKSPACE_SERVICE.setImages` 写入文档模型。

## 集成

```ts
import { fileLoaderPlugin } from '@kabel/plugin-file-loader';
import '@kabel/plugin-file-loader/style.css'; // 使用 @kabel/editor 的 style.css 时已包含

createArchiveEditor(el, { plugins: [fileLoaderPlugin({ minio: { endpoint: 'http://127.0.0.1:9000', bucket: 'archive' } })] });
```

工具栏左侧出现“打开”菜单：本地目录 / MinIO 桶与路径 / URL 列表。

## 配置 `FileLoaderOptions`

| 选项 | 说明 |
| --- | --- |
| `extensions` | 无 MIME 信息时视为影像的扩展名，默认 jpg/png/gif/webp/bmp/svg/avif/tif |
| `minio` | MinIO 对话框预填值（`MinioConfig` 的子集）；密钥只在内存使用，不持久化 |
| `signUrl` | 自定义签名，如向后端换取预签名地址；提供后浏览器不再接触密钥（**生产环境推荐**） |
| `toolbar` | `{ group, order }` 调整入口位置；`false` 不注册入口，宿主自行调用命令/服务 |

## 来源说明

- **MinIO**：路径风格寻址，ListObjectsV2 分页列出对象（默认递归，子目录名作为文件目录分组）；填写 Access/Secret Key 时用 AWS SigV4 生成预签名地址，`<img>` 直接使用；公开读桶可不填。**需在 MinIO 上为页面来源配置 CORS**（允许 GET/HEAD）。密钥输入仅适合内网/调试，正式环境请用 `signUrl`。
- **本地目录**：优先 `showDirectoryPicker`（Chromium，需 HTTPS 或 localhost），否则回退到 `<input webkitdirectory>`。子目录作为分组，本地文件由工作台创建并管理 object URL。
- **URL 列表**：按换行/逗号/分号分隔，去重，`#` 开头为注释。无法判断类型的 URL 一律按影像处理。

加载结果**替换**当前打开的文件；非影像文件被跳过并在提示中说明数量；文件按目录+文件名自然排序（`2.jpg` 在 `10.jpg` 之前）。

## 命令

`fileLoader.openDirectory`、`fileLoader.openUrls`（打开对话框）、`fileLoader.openMinio`（打开对话框）

## 服务 `FILE_LOADER_SERVICE`

`loadUrls(urls)`、`loadMinio(config)`、`loadFiles(files)`（拖拽/`<input>` 得到的 `File`）、`openDirectory()`（须在用户手势中调用，取消返回 `null`）。失败会通过 `NOTIFY_SERVICE` 提示并 reject。

## 事件

`file-loader:load`：`{ source: 'minio' | 'directory' | 'urls' | 'files', loaded, skipped }`

## 状态与样式

切片 `fileLoader = { dialog, busy }`（不入撤销栈）；样式类前缀 `kb-fl`，位于 `src/style.css`。
