import { redactString } from "../redact-string";
import {
  PatternBasedRedactorSet,
  redactKey,
  redactKeysEndingWith,
} from "./pattern-based-redactors";

/**
 * We include a default set of redactors here. Note that if you are using
 * redactNestedFields in typescript then if your objects include any string fields
 * that don't match the below list you'll still be forced at compile time to add an
 * explict redaction policy for them.
 */

/**
 * We don't want to redact enum fields like "deserializerClassName", so we're
 * careful to only redact fields that are likely to be PII.
 */
export const NAME_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKey("name", redactString))
  .with(redactKeysEndingWith("_name", redactString))
  .with(redactKeysEndingWith("ullName", redactString))
  .with(redactKeysEndingWith("irstname", redactString))
  .with(redactKeysEndingWith("astname", redactString));

export const URL_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKeysEndingWith("url", redactString))
  .with(redactKeysEndingWith("uri", redactString))
  .with(redactKeysEndingWith("link", redactString))
  .with(redactKeysEndingWith("href", redactString))
  .with(redactKeysEndingWith("Url", redactString))
  .with(redactKeysEndingWith("Uri", redactString))
  .with(redactKeysEndingWith("Link", redactString))
  .with(redactKeysEndingWith("Href", redactString));

export const OTHER_PII_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKey("address", redactString))
  .with(redactKeysEndingWith("addressLine1", redactString))
  .with(redactKeysEndingWith("address_line_1", redactString))
  .with(redactKeysEndingWith("homeAddress", redactString))
  .with(redactKeysEndingWith("home_address", redactString))
  .with(redactKeysEndingWith("postalAddress", redactString))
  .with(redactKeysEndingWith("postal_address", redactString))
  .with(redactKeysEndingWith("phone", redactString))
  .with(redactKeysEndingWith("Phone", redactString))
  .with(redactKeysEndingWith("phone_number", redactString))
  .with(redactKeysEndingWith("ssn", redactString))
  .with(redactKeysEndingWith("SSN", redactString))
  .with(redactKeysEndingWith("username", redactString))
  .with(redactKeysEndingWith("Username", redactString))
  .with(redactKeysEndingWith("user_name", redactString))
  .with(redactKeysEndingWith("credit_card", redactString))
  .with(redactKeysEndingWith("creditCard", redactString))
  .with(redactKeysEndingWith("credit_card_number", redactString))
  .with(redactKeysEndingWith("creditCardNumber", redactString))
  .with(redactKeysEndingWith("cvc", redactString))
  .with(redactKeysEndingWith("CVC", redactString));

export const FREE_TEXT_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKeysEndingWith("text", redactString))
  .with(redactKeysEndingWith("description", redactString))
  .with(redactKeysEndingWith("summary", redactString))
  .with(redactKeysEndingWith("title", redactString))
  .with(redactKeysEndingWith("Text", redactString))
  .with(redactKeysEndingWith("Description", redactString))
  .with(redactKeysEndingWith("Summary", redactString))
  .with(redactKeysEndingWith("Title", redactString));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const redactDateOfBirth = (_: Date): Date => {
  return new Date(0);
};

export const DOB_REDACTORS = PatternBasedRedactorSet.create<Date>()
  .with(redactKeysEndingWith("dob", redactDateOfBirth))
  .with(redactKeysEndingWith("DOB", redactDateOfBirth))
  .with(redactKeysEndingWith("date_of_birth", redactDateOfBirth))
  .with(redactKeysEndingWith("dateOfBirth", redactDateOfBirth))
  .with(redactKeysEndingWith("DateOfBirth", redactDateOfBirth))
  .with(redactKeysEndingWith("birthDate", redactDateOfBirth))
  .with(redactKeysEndingWith("BirthDate", redactDateOfBirth))
  .with(redactKeysEndingWith("birth_date", redactDateOfBirth));

export const doNotRedact = <T>(value: T): T => value;

export const ID_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKey("id", doNotRedact))
  .with(redactKeysEndingWith("Id", doNotRedact))
  .with(redactKeysEndingWith("ID", doNotRedact))
  .with(redactKeysEndingWith("_id", doNotRedact))
  .with(redactKeysEndingWith("uuid", doNotRedact))
  .with(redactKeysEndingWith("UUID", doNotRedact))
  .with(redactKeysEndingWith("uuidv4", doNotRedact))
  .with(redactKeysEndingWith("UUIDv4", doNotRedact))
  .with(redactKeysEndingWith("guid", doNotRedact))
  .with(redactKeysEndingWith("GUID", doNotRedact))
  .with(redactKeysEndingWith("Guid", doNotRedact));

export const TYPE_UNION_REDACTORS = PatternBasedRedactorSet.create<string>()
  .with(redactKey("type", doNotRedact))
  .with(redactKeysEndingWith("Type", doNotRedact))
  .with(redactKeysEndingWith("_type", doNotRedact))
  .with(redactKeysEndingWith("TYPE", doNotRedact))
  .with(redactKey("kind", doNotRedact))
  .with(redactKeysEndingWith("Kind", doNotRedact))
  .with(redactKeysEndingWith("_kind", doNotRedact));

/**
 * We recommend not redacting fields like "created_at" or "updated_at" as
 * these are rarely sensitive, and preserving the original dates helps better
 * test your code's edge cases.
 */
export const DATES_AS_STRINGS_THAT_DO_NOT_NEED_REDACTION =
  PatternBasedRedactorSet.create<string>()
    .with(redactKeysEndingWith("ed_at", doNotRedact))
    .with(redactKeysEndingWith("edAt", doNotRedact));

export const ALL_STRING_FIELDS_THAT_DEFAULT_TO_NO_REDACTION =
  PatternBasedRedactorSet.create<string>()
    .withSet(ID_REDACTORS)
    .withSet(TYPE_UNION_REDACTORS)
    .withSet(DATES_AS_STRINGS_THAT_DO_NOT_NEED_REDACTION);

export const ALL_DEFAULT_STRING_REDACTORS =
  PatternBasedRedactorSet.create<string>()
    .withSet(ALL_STRING_FIELDS_THAT_DEFAULT_TO_NO_REDACTION)
    .withSet(NAME_REDACTORS)
    .withSet(URL_REDACTORS)
    .withSet(OTHER_PII_REDACTORS)
    .withSet(FREE_TEXT_REDACTORS);

export const ALL_DEFAULT_DATE_REDACTORS =
  PatternBasedRedactorSet.create<Date>().withSet(DOB_REDACTORS);
