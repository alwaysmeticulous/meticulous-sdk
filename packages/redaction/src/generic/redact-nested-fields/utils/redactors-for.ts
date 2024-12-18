type IsFixedStringUnion<T> = T extends string
  ? string extends T
    ? false
    : true
  : false;

type WithoutNullOrUndefined<T> = T extends null | undefined ? never : T;

type AllValues<T> = UnionToIntersection<T>[keyof UnionToIntersection<T>];

type RelevantPrimitiveFieldNames<
  T,
  PRIMATIVES_TO_REDACT = string | Date
> = AllValues<{
  [K in keyof T]: PrimitiveFieldNamesHelper<
    K,
    WithoutNullOrUndefined<T[K]>,
    PRIMATIVES_TO_REDACT
  >;
}>;

type PrimitiveFieldNamesHelper<K, V, PRIMATIVES_TO_REDACT> =
  IsFixedStringUnion<V> extends true
    ? never
    : V extends PRIMATIVES_TO_REDACT
    ? [K, V]
    : V extends Array<infer U>
    ? U extends PRIMATIVES_TO_REDACT
      ? [K, U]
      : RelevantPrimitiveFieldNames<U>
    : V extends object
    ? RelevantPrimitiveFieldNames<V>
    : never;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

export type Redactor<T> = (value: T) => T;

// Convert a single tuple to a key-value pair in an redactor object
type ToRedactorObject<T> = T extends [infer K, infer V]
  ? K extends string
    ? { [P in K]: Redactor<V> }
    : never
  : never;

type TuplePairsToRedactorObject<T> = UnionToIntersection<ToRedactorObject<T>>;

export type RedactorsFor<
  T,
  PRIMATIVES_TO_REDACT = string
> = TuplePairsToRedactorObject<
  RelevantPrimitiveFieldNames<T, PRIMATIVES_TO_REDACT>
>;
