/**
 * 示例插件：识别填充（运行期按需加载）。
 *
 * 宿主通过 `editor.use(() => import('./ocr-assist'))` 在运行时注册，
 * 演示异步 setup、跨插件服务调用（影像 + 元数据）、批量写入为一条历史记录、卸载后自动清理。
 */
import { definePlugin, ExtensionPoints, METADATA_SERVICE, VIEWER_SERVICE, createSlice } from '@kabel/editor';

interface OcrState {
  running: boolean;
}

declare module '@kabel/editor' {
  interface KabelState {
    ocr: OcrState;
  }
}

const ocrSlice = createSlice({
  name: 'ocr',
  initialState: { running: false } as OcrState,
  reducers: { setRunning: (_s: OcrState, running: boolean) => ({ running }) },
});

/** 模拟识别服务：真实项目中替换为后端 OCR 接口 */
async function recognize(imageName: string): Promise<Record<string, unknown>> {
  await new Promise((r) => setTimeout(r, 600));
  return {
    title: `关于做好${imageName.replace(/\.\w+$/, '')}档案移交工作的通知`,
    author: '示例市档案局',
    docDate: '20240315',
  };
}

export default definePlugin({
  name: 'example:ocr-assist',
  dependencies: ['kabel:metadata', 'kabel:viewer'],
  async setup(ctx) {
    ctx.registerSlice(ocrSlice);
    ctx.registerCommand({
      id: 'ocr.fill',
      title: '识别填充',
      enabled: (k) => !k.getState().ocr.running && k.getState().viewer.images.length > 0,
      run: async (k) => {
        const image = k.services.get(VIEWER_SERVICE).current();
        if (!image) return;
        k.dispatch(ocrSlice.actions.setRunning(true));
        try {
          const values = await recognize(image.name);
          k.services.get(METADATA_SERVICE).setValues(values, `识别填充（${image.name}）`);
        } finally {
          k.dispatch(ocrSlice.actions.setRunning(false));
        }
      },
    });
    ctx.contribute(ExtensionPoints.toolbar, { id: 'ocr.fill', icon: 'eye', label: '识别填充', command: 'ocr.fill', order: 40 });
    ctx.contribute(ExtensionPoints.statusbar, {
      id: 'ocr.state',
      align: 'right',
      order: 5,
      text: (s) => (s.ocr?.running ? '识别中…' : null),
    });
  },
});
