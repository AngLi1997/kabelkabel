import type { PanelViewProps } from '@kabel/core';
import { Empty, useContributions, useKernel, useSelector, ViewHost } from '@kabel/ui';
import { WorkspaceExtensions } from '../extensions';

/** 内容区域：按当前文件的类型选择渲染器展示；没有文件或没有匹配的渲染器时给出提示 */
export function ContentPanel(_: PanelViewProps) {
  const kernel = useKernel();
  const document = useSelector((s) => s.documents.items[s.documents.index]);
  const loading = useSelector((s) => s.documents.loading);
  const renderers = useContributions(WorkspaceExtensions.renderers);
  if (!document) return <Empty icon="image" text={loading ? '文件加载中' : '暂无文件'} />;
  const renderer = renderers.find((r) => r.match(document));
  if (!renderer) return <Empty icon="file" text={`暂不支持预览此类文件（${document.kind}）`} />;
  return <ViewHost key={renderer.id} view={renderer.view} props={{ kernel, document }} />;
}
