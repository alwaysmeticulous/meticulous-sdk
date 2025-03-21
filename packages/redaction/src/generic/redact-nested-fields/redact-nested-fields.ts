import {
  ALL_DEFAULT_DATE_REDACTORS,
  ALL_DEFAULT_STRING_REDACTORS,
} from "./common-redactors";
import {
  PatternBasedRedactor,
  PatternBasedRedactorSet,
} from "./pattern-based-redactors";
import { Redactor, RedactorsFor } from "./utils/redactors-for";

export class NestedFieldsRedactor<
  HANDLED_STRING_KEY_TYPES extends string,
  HANDLED_DATE_KEY_TYPES extends string
> {
  private constructor(
    private readonly stringRedactors: Array<
      PatternBasedRedactor<string, string>
    >,
    private readonly dateRedactors: Array<PatternBasedRedactor<string, Date>>,
    private readonly defaultStringRedactor?: Redactor<string>
  ) {}

  public static builder() {
    return new NestedFieldsRedactor<never, never>([], []);
  }

  /**
   * Provides an opinionated set of redactors that are useful for most use cases,
   * which can then be built upon. See {@link ALL_DEFAULT_STRING_REDACTORS} and
   * {@link ALL_DEFAULT_DATE_REDACTORS} for more details.
   *
   * (recommended)
   */
  public static builderWithDefaults() {
    return new NestedFieldsRedactor<never, never>([], [])
      .withPatternBasedStringRedactors(ALL_DEFAULT_STRING_REDACTORS)
      .withPatternBasedDateRedactors(ALL_DEFAULT_DATE_REDACTORS);
  }

  public withDefaultStringRedactor(redactor: Redactor<string>) {
    return new NestedFieldsRedactor<
      HANDLED_STRING_KEY_TYPES,
      HANDLED_DATE_KEY_TYPES
    >(this.stringRedactors, this.dateRedactors, redactor);
  }

  public withPatternBasedStringRedactor<KEY_TYPE extends string>(
    redactor: PatternBasedRedactor<KEY_TYPE, string>
  ): NestedFieldsRedactor<
    HANDLED_STRING_KEY_TYPES & KEY_TYPE,
    HANDLED_DATE_KEY_TYPES
  > {
    return new NestedFieldsRedactor<
      HANDLED_STRING_KEY_TYPES & KEY_TYPE,
      HANDLED_DATE_KEY_TYPES
    >([...this.stringRedactors, redactor], this.dateRedactors);
  }

  public withPatternBasedStringRedactors<KEY_TYPE extends string>(
    set: PatternBasedRedactorSet<KEY_TYPE, string>
  ): NestedFieldsRedactor<
    HANDLED_STRING_KEY_TYPES | KEY_TYPE,
    HANDLED_DATE_KEY_TYPES
  > {
    return new NestedFieldsRedactor<
      HANDLED_STRING_KEY_TYPES | KEY_TYPE,
      HANDLED_DATE_KEY_TYPES
    >([...this.stringRedactors, ...set.redactors], this.dateRedactors);
  }

  public withPatternBasedDateRedactor<KEY_TYPE extends string>(
    redactor: PatternBasedRedactor<KEY_TYPE, Date>
  ): NestedFieldsRedactor<
    HANDLED_STRING_KEY_TYPES,
    HANDLED_DATE_KEY_TYPES | KEY_TYPE
  > {
    return new NestedFieldsRedactor<
      HANDLED_STRING_KEY_TYPES,
      HANDLED_DATE_KEY_TYPES | KEY_TYPE
    >(this.stringRedactors, [...this.dateRedactors, redactor]);
  }

  public withPatternBasedDateRedactors<KEY_TYPE extends string>(
    set: PatternBasedRedactorSet<KEY_TYPE, Date>
  ): NestedFieldsRedactor<
    HANDLED_STRING_KEY_TYPES,
    HANDLED_DATE_KEY_TYPES | KEY_TYPE
  > {
    return new NestedFieldsRedactor<
      HANDLED_STRING_KEY_TYPES,
      HANDLED_DATE_KEY_TYPES | KEY_TYPE
    >(this.stringRedactors, [...this.dateRedactors, ...set.redactors]);
  }

  /**
   * Type safety: forces a redaction policy to be set for every unique nested string field name in the object.
   * Leaves redaction of dates, numbers and bigints as optional.
   *
   * Note: if a redactor is provided for a property x that already has a default redaction policy then that
   * redactor will be used for property x rather than the default redaction policy.
   */
  public createRedactor<T>(opts: {
    strings: Omit<RedactorsFor<T>, HANDLED_STRING_KEY_TYPES> &
      Partial<RedactorsFor<T>>;
    dates?: Partial<RedactorsFor<T, Date>>;
    numbers?: Partial<RedactorsFor<T, number>>;
    bigints?: Partial<RedactorsFor<T, bigint>>;
    defaultStringRedactor?: Redactor<string>;
  }) {
    return createRedactor({
      ...opts,
      patternBasedRedactors: {
        strings: this.stringRedactors,
        dates: this.dateRedactors,
      },
    } as MultiTypeRedactors<T>);
  }

  /**
   * Type safety: forces a redaction policy to be set for every unique nested string, date, number and bigint
   * field name in the object.
   *
   * Note: if a redactor is provided for a property x that already has a default redaction policy then that
   * redactor will be used for property x rather than the default redaction policy.
   */
  public createRedactorStrict<T>(opts: {
    strings: Omit<RedactorsFor<T>, HANDLED_STRING_KEY_TYPES> &
      Partial<RedactorsFor<T>>;
    dates: Omit<RedactorsFor<T, Date>, HANDLED_DATE_KEY_TYPES> &
      Partial<RedactorsFor<T, Date>>;
    numbers: RedactorsFor<T, number>;
    bigints: RedactorsFor<T, bigint>;
    defaultStringRedactor?: Redactor<string>;
  }) {
    return createRedactor({
      ...opts,
      patternBasedRedactors: {
        strings: this.stringRedactors,
        dates: this.dateRedactors,
      },
    } as any as MultiTypeRedactors<T>);
  }

  /**
   * Type safety: does not force a redaction policy to be set of any field.
   *
   * Note: if a redactor is provided for a property x that already has a default redaction policy then that
   * redactor will be used for property x rather than the default redaction policy.
   */
  public createRedactorLax = <T>(opts: {
    strings: Record<string, Redactor<string>>;
    dates?: Record<string, Redactor<Date>>;
    numbers?: Record<string, Redactor<number>>;
    bigints?: Record<string, Redactor<bigint>>;
    defaultStringRedactor?: Redactor<string>;
  }): ((value: T) => T) => {
    return createRedactor({
      ...opts,
      patternBasedRedactors: {
        strings: this.stringRedactors,
        dates: this.dateRedactors,
      },
    } as MultiTypeRedactors<T>);
  };
}

interface MultiTypeRedactors<T> {
  patternBasedRedactors: {
    strings: Array<PatternBasedRedactor<string, string>>;
    dates: Array<PatternBasedRedactor<string, Date>>;
  };
  strings: RedactorsFor<T>;
  dates?: Partial<RedactorsFor<T, Date>>;
  numbers?: Partial<RedactorsFor<T, number>>;
  bigints?: Partial<RedactorsFor<T, bigint>>;
  defaultStringRedactor?: Redactor<string>;
}

const createRedactor = <T>({
  strings,
  dates,
  numbers,
  bigints,
  patternBasedRedactors,
  defaultStringRedactor,
}: MultiTypeRedactors<T>): ((value: T) => T) => {
  const indexedPatternBasedStringRedactors: {
    byTrailingBigram: Record<
      string,
      Array<PatternBasedRedactor<string, string>>
    >;
    other: Array<PatternBasedRedactor<string, string>>;
  } = {
    byTrailingBigram: {},
    other: [],
  };
  for (const redactor of patternBasedRedactors.strings) {
    const keyMatch =
      redactor.type === "key-postfix" ? redactor.postfix : redactor.key;
    if (keyMatch.length >= 2) {
      const trailingBigram = keyMatch.slice(-2);
      indexedPatternBasedStringRedactors.byTrailingBigram[trailingBigram] = [
        ...(indexedPatternBasedStringRedactors.byTrailingBigram[
          trailingBigram
        ] ?? []),
        redactor,
      ];
    } else {
      indexedPatternBasedStringRedactors.other.push(redactor);
    }
  }

  const redactFn = (value: T, key?: string): T => {
    if (
      value == null ||
      typeof value === "boolean" ||
      typeof value === "function" ||
      typeof value === "symbol"
    ) {
      return value;
    }

    if (typeof value === "string") {
      const fieldRedactor = key && strings ? (strings as any)[key] : undefined;
      if (!fieldRedactor) {
        const patternBasedRedactor = key
          ? findApplicablePatternBasedStringRedactor(
              key,
              indexedPatternBasedStringRedactors
            )
          : null;
        if (patternBasedRedactor) {
          return patternBasedRedactor.redactor(value) as T;
        }
        return defaultStringRedactor
          ? (defaultStringRedactor(value) as T)
          : value;
      }
      return fieldRedactor(value);
    }

    if (typeof value === "number") {
      const fieldRedactor = key && numbers ? (numbers as any)[key] : undefined;
      if (!fieldRedactor) {
        return value;
      }
      return fieldRedactor(value);
    }

    if (typeof value === "bigint") {
      const fieldRedactor = key && bigints ? (bigints as any)[key] : undefined;
      if (!fieldRedactor) {
        return value;
      }
      return fieldRedactor(value);
    }

    if (value instanceof Date) {
      const fieldRedactor = key && dates ? (dates as any)[key] : undefined;
      if (!fieldRedactor) {
        const patternBasedRedactor = key
          ? findApplicablePatternBasedRedactor(key, patternBasedRedactors.dates)
          : null;
        if (patternBasedRedactor) {
          return patternBasedRedactor.redactor(value) as T;
        }
        return value;
      }
      return fieldRedactor(value);
    }

    if (Array.isArray(value)) {
      let hasRedacted = false;
      const redactedValueEntries = value.map((value) => {
        // Note: we use the key of the array here, so if you have:
        //
        // { passwords: ["password1", "password2"] }
        //
        // and set a redactor for "passwords" then it will apply it to each password
        // in the array.
        const redacted = redactFn(value, key);
        if (redacted !== value) {
          hasRedacted = true;
        }
        return redacted;
      });
      return hasRedacted ? (redactedValueEntries as T) : value;
    }

    if (typeof value === "object") {
      let hasRedacted = false;
      const redactedValueEntries = Object.entries(value).map(([key, value]) => {
        const redacted = redactFn(value, key);
        if (redacted !== value) {
          hasRedacted = true;
        }
        return [key, redacted];
      });
      return hasRedacted ? Object.fromEntries(redactedValueEntries) : value;
    }

    return value;
  };

  return redactFn;
};

const findApplicablePatternBasedRedactor = <T>(
  key: string,
  redactors: PatternBasedRedactor<string, T>[]
) => {
  return redactors.find((redactor) => {
    if (redactor.type === "key-postfix") {
      return key.endsWith(redactor.postfix);
    }
    if (redactor.type === "key-exact") {
      return key === redactor.key;
    }
    return false;
  });
};

const findApplicablePatternBasedStringRedactor = (
  key: string,
  indexedPatternBasedStringRedactors: {
    byTrailingBigram: Record<
      string,
      Array<PatternBasedRedactor<string, string>>
    >;
    other: Array<PatternBasedRedactor<string, string>>;
  }
) => {
  const redactor = findApplicablePatternBasedRedactor(
    key,
    indexedPatternBasedStringRedactors.other
  );
  if (redactor || key.length < 2) {
    return redactor;
  }
  const redactorsMatchingBigram =
    indexedPatternBasedStringRedactors.byTrailingBigram[key.slice(-2)] ?? [];
  if (redactorsMatchingBigram.length === 0) {
    return null;
  }
  return findApplicablePatternBasedRedactor(key, redactorsMatchingBigram);
};
