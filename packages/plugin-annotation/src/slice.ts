import { createSlice } from '@kabel/core';
import type { Annotation, AnnotationLabel, AnnotationMap, AnnotationTool, ImageSize, LabelInput } from './types';

export interface AnnotatorState {
  labels: AnnotationLabel[];
  /** 新建标记使用的类型 */
  active: string;
  selected: string | null;
  /** 列表悬停时高亮对应标记框 */
  hovered: string | null;
  tool: AnnotationTool;
  /** 已知的图片原始尺寸，用于 YOLO 归一化 */
  sizes: Record<string, ImageSize>;
}

declare module '@kabel/core' {
  interface KabelState {
    /** 标记数据（纳入撤销） */
    annotations: AnnotationMap;
    annotator: AnnotatorState;
  }
  interface KabelEvents {
    'annotation:change': { annotations: AnnotationMap };
  }
}

const PALETTE = ['#e5484d', '#0090ff', '#30a46c', '#f76b15', '#6e56cf', '#12a594', '#d6409f', '#b08800', '#8d6e63', '#5b6b7a'];

export const DEFAULT_LABELS: LabelInput[] = ['题名', '文号', '责任者', '成文日期', '印章', '签名', '正文', '表格', '附件'];

export function normalizeLabels(inputs: readonly LabelInput[] = DEFAULT_LABELS): AnnotationLabel[] {
  const seen = new Set<string>();
  const labels: AnnotationLabel[] = [];
  inputs.forEach((input, i) => {
    const item = typeof input === 'string' ? { name: input } : input;
    const id = item.id ?? item.name;
    if (!item.name || seen.has(id)) return;
    seen.add(id);
    labels.push({ id, name: item.name, color: item.color ?? PALETTE[i % PALETTE.length]! });
  });
  return labels;
}

let seq = 0;
export const createAnnotationId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

const replaceIn = (s: AnnotationMap, imageId: string, list: Annotation[]): AnnotationMap => {
  if (list.length) return { ...s, [imageId]: list };
  const { [imageId]: _removed, ...rest } = s;
  return rest;
};

export const annotationsSlice = createSlice({
  name: 'annotations',
  initialState: {} as AnnotationMap,
  history: true,
  reducers: {
    add: (s: AnnotationMap, p: { imageId: string; annotation: Annotation }) =>
      replaceIn(s, p.imageId, [...(s[p.imageId] ?? []), p.annotation]),
    update: (s: AnnotationMap, p: { imageId: string; id: string; patch: Partial<Omit<Annotation, 'id'>> }) => {
      const list = s[p.imageId];
      const target = list?.find((a) => a.id === p.id);
      if (!list || !target) return s;
      const next = { ...target, ...p.patch };
      if ((Object.keys(p.patch) as (keyof Annotation)[]).every((k) => next[k] === target[k])) return s;
      return replaceIn(s, p.imageId, list.map((a) => (a === target ? next : a)));
    },
    remove: (s: AnnotationMap, p: { imageId: string; id: string }) => {
      const list = s[p.imageId];
      if (!list?.some((a) => a.id === p.id)) return s;
      return replaceIn(s, p.imageId, list.filter((a) => a.id !== p.id));
    },
    load: (_s: AnnotationMap, map: AnnotationMap) => map,
  },
});

export const annotationActions = annotationsSlice.actions;

export function createAnnotatorSlice(labels: AnnotationLabel[]) {
  return createSlice({
    name: 'annotator',
    initialState: {
      labels,
      active: labels[0]?.id ?? '',
      selected: null,
      hovered: null,
      tool: 'draw',
      sizes: {},
    } as AnnotatorState,
    reducers: {
      setActive: (s: AnnotatorState, id: string) => (s.active === id || !s.labels.some((l) => l.id === id) ? s : { ...s, active: id }),
      select: (s: AnnotatorState, id: string | null) => (s.selected === id ? s : { ...s, selected: id }),
      hover: (s: AnnotatorState, id: string | null) => (s.hovered === id ? s : { ...s, hovered: id }),
      setTool: (s: AnnotatorState, tool: AnnotationTool) => (s.tool === tool ? s : { ...s, tool }),
      setSize: (s: AnnotatorState, p: { imageId: string; size: ImageSize }) => {
        const prev = s.sizes[p.imageId];
        if (prev && prev.width === p.size.width && prev.height === p.size.height) return s;
        return { ...s, sizes: { ...s.sizes, [p.imageId]: p.size } };
      },
      setSizes: (s: AnnotatorState, sizes: Record<string, ImageSize>) => ({ ...s, sizes, selected: null, hovered: null }),
    },
  });
}

export const annotatorActions = createAnnotatorSlice([]).actions;
