export interface AnnotationLabel {
  id: string;
  name: string;
  color: string;
}

/** 标记类型的输入写法：名称字符串或对象 */
export type LabelInput = string | { id?: string; name: string; color?: string };

/** 矩形框，单位为图片原始像素，原点在左上角 */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation extends BBox {
  id: string;
  /** 标记类型 id */
  label: string;
}

/** 以图片 id 为键的标记集合 */
export type AnnotationMap = Record<string, Annotation[]>;

export interface ImageSize {
  width: number;
  height: number;
}

export type AnnotationTool = 'draw' | 'pan';

/** JSON 导出格式，也是 setAnnotations 的输入格式 */
export interface AnnotationDocument {
  labels: AnnotationLabel[];
  images: {
    id: string;
    name?: string;
    width?: number;
    height?: number;
    annotations: { id?: string; label: string; bbox: [number, number, number, number] }[];
  }[];
}
