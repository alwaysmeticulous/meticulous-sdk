/**
 * Copied from @jridgewell/sourcemap-codec (src/vlq.ts, src/strings.ts,
 * src/sourcemap-codec.ts). See LICENSE in this directory.
 *
 * Modifications: decode only — the encoder, the scope/range codecs and the
 * string writer are dropped, since the plugin only ever reads a map Vite hands
 * it.
 */

import { COLUMN, type SourceMapSegment } from "./sourcemap-segment";

const comma = ",".charCodeAt(0);
const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const charToInt = new Uint8Array(128);

for (let i = 0; i < chars.length; i++) {
  charToInt[chars.charCodeAt(i)] = i;
}

class StringReader {
  pos = 0;

  constructor(private readonly buffer: string) {}

  next(): number {
    return this.buffer.charCodeAt(this.pos++);
  }

  peek(): number {
    return this.buffer.charCodeAt(this.pos);
  }

  indexOf(char: string): number {
    const idx = this.buffer.indexOf(char, this.pos);
    return idx === -1 ? this.buffer.length : idx;
  }
}

const decodeInteger = (reader: StringReader, relative: number): number => {
  let value = 0;
  let shift = 0;
  let integer = 0;
  do {
    const c = reader.next();
    integer = charToInt[c];
    value |= (integer & 31) << shift;
    shift += 5;
  } while (integer & 32);

  const shouldNegate = value & 1;
  value >>>= 1;
  if (shouldNegate) {
    value = -2147483648 | -value;
  }
  return relative + value;
};

const hasMoreVlq = (reader: StringReader, max: number): boolean => {
  if (reader.pos >= max) {
    return false;
  }
  return reader.peek() !== comma;
};

const sortComparator = (a: SourceMapSegment, b: SourceMapSegment): number =>
  a[COLUMN] - b[COLUMN];

/** Decodes a source map's `mappings` string into per-generated-line segments. */
export const decode = (mappings: string): SourceMapSegment[][] => {
  const { length } = mappings;
  const reader = new StringReader(mappings);
  const decoded: SourceMapSegment[][] = [];
  let genColumn = 0;
  let sourcesIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let namesIndex = 0;

  do {
    const semi = reader.indexOf(";");
    const line: SourceMapSegment[] = [];
    let sorted = true;
    let lastCol = 0;
    genColumn = 0;

    while (reader.pos < semi) {
      let seg: SourceMapSegment;

      genColumn = decodeInteger(reader, genColumn);
      if (genColumn < lastCol) {
        sorted = false;
      }
      lastCol = genColumn;

      if (hasMoreVlq(reader, semi)) {
        sourcesIndex = decodeInteger(reader, sourcesIndex);
        sourceLine = decodeInteger(reader, sourceLine);
        sourceColumn = decodeInteger(reader, sourceColumn);

        if (hasMoreVlq(reader, semi)) {
          namesIndex = decodeInteger(reader, namesIndex);
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex];
        } else {
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn];
        }
      } else {
        seg = [genColumn];
      }

      line.push(seg);
      reader.pos++;
    }

    if (!sorted) {
      line.sort(sortComparator);
    }
    decoded.push(line);
    reader.pos = semi + 1;
  } while (reader.pos <= length);

  return decoded;
};

/** Sorts any generated line whose segments arrived out of column order. */
export const maybeSort = (
  mappings: SourceMapSegment[][],
): SourceMapSegment[][] => {
  for (const line of mappings) {
    for (let j = 1; j < line.length; j++) {
      if (line[j][COLUMN] < line[j - 1][COLUMN]) {
        line.sort(sortComparator);
        break;
      }
    }
  }
  return mappings;
};
