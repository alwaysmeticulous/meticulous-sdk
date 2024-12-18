export type PatternBasedRedactor<KEY_TYPE extends string, VALUE_TYPE> =
  | PostfixPatternBasedRedactor<KEY_TYPE, VALUE_TYPE>
  | ExactPatternBasedRedactor<KEY_TYPE, VALUE_TYPE>;

export interface PostfixPatternBasedRedactor<
  KEY_TYPE extends string,
  VALUE_TYPE
> {
  type: "key-postfix";
  postfix: string;
  redactor: (value: VALUE_TYPE) => VALUE_TYPE;

  /**
   * This property is always undefined, but used to ensure type safety.
   */
  __keyType?: KEY_TYPE;
}

export interface ExactPatternBasedRedactor<
  KEY_TYPE extends string,
  VALUE_TYPE
> {
  type: "key-exact";
  key: KEY_TYPE;
  redactor: (value: VALUE_TYPE) => VALUE_TYPE;

  /**
   * This property is always undefined, but used to ensure type safety.
   */
  __keyType?: KEY_TYPE;
}

/**
 * Example:
 *
 * ```
 *  redactKeysEndingWith("name", asterixOut)
 * ```
 *
 * Would redact `name` and `first_name` but not `firstName`.
 */
export const redactKeysEndingWith = <POSTFIX_TYPE extends string, VALUE_TYPE>(
  postfix: string extends POSTFIX_TYPE ? never : POSTFIX_TYPE,
  redactor: (value: VALUE_TYPE) => VALUE_TYPE
): PatternBasedRedactor<`${string}${POSTFIX_TYPE}`, VALUE_TYPE> => {
  return { type: "key-postfix", postfix, redactor };
};

export const redactKey = <KEY_TYPE extends string, VALUE_TYPE>(
  key: KEY_TYPE,
  redactor: (value: VALUE_TYPE) => VALUE_TYPE
): PatternBasedRedactor<KEY_TYPE, VALUE_TYPE> => {
  return { type: "key-exact", key, redactor };
};

export class PatternBasedRedactorSet<
  HANDLED_KEYS_TYPE extends string,
  VALUE_TYPE
> {
  private constructor(
    public readonly redactors: PatternBasedRedactor<
      HANDLED_KEYS_TYPE,
      VALUE_TYPE
    >[]
  ) {}

  public static create<VALUE_TYPE>() {
    return new PatternBasedRedactorSet<never, VALUE_TYPE>([]);
  }

  public with<KEY_TYPE extends string>(
    redactor: PatternBasedRedactor<KEY_TYPE, VALUE_TYPE>
  ): PatternBasedRedactorSet<HANDLED_KEYS_TYPE | KEY_TYPE, VALUE_TYPE> {
    return new PatternBasedRedactorSet<
      HANDLED_KEYS_TYPE | KEY_TYPE,
      VALUE_TYPE
    >([...this.redactors, redactor]);
  }

  public withSet<KEY_TYPE extends string>(
    set: PatternBasedRedactorSet<KEY_TYPE, VALUE_TYPE>
  ): PatternBasedRedactorSet<HANDLED_KEYS_TYPE | KEY_TYPE, VALUE_TYPE> {
    return new PatternBasedRedactorSet<
      HANDLED_KEYS_TYPE | KEY_TYPE,
      VALUE_TYPE
    >([...this.redactors, ...set.redactors]);
  }
}
