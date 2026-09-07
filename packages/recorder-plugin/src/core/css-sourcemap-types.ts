/** A stylesheet as it appeared once Vite finished compiling it. */
export interface CompiledStylesheet {
  /** The file the stylesheet lives in, without Vite's module query. */
  sourcePath: string;
  code: string;
  map: RawSourceMap | null;
}

/** Where a compiled stylesheet ended up inside the concatenated CSS asset. */
export interface PlacedStylesheet {
  id: string;
  stylesheet: CompiledStylesheet;
  line: number;
  column: number;
  /** Leading compiled lines that were hoisted away from the rest. */
  skippedLines: number;
  /** How many lines of the asset the stylesheet accounts for. */
  span: number;
}

/** A region of the concatenated asset that one stylesheet occupies. */
export interface AssetRegion {
  start: number;
  end: number;
}

export interface RawSourceMap {
  version: number;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
}
