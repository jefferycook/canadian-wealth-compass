import { afterEach, describe, expect, it, vi } from "vitest";

import { ageAtBeginningOfYear, ageAttainedDuringYear, ageFromDob } from "./ages";

/**
 * Boundary regression tests for the two pure statutory age-basis helpers in
 * ages.ts (issue #81, follow-on from the draft PR #70 research).
 *
 * Tests only. They pin the helpers' existing documented contract:
 *   - ageAtBeginningOfYear(dob, year): whole-year age on January 1 of `year`.
 *     Only a January-1 birthday has already occurred at the start of the year.
 *   - ageAttainedDuringYear(dob, year): whole-year age reached by December 31
 *     of `year`, i.e. year - birthYear.
 * Each expected value below is hand arithmetic on the calendar, not an engine
 * output. Nothing here asserts which helper the projection engine should call;
 * that is a separate, unauthorized methodology question (see PR #70 §8).
 */

const localDate = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("ageAtBeginningOfYear: January 1 and year-boundary cases", () => {
  it("a January 1 birthday has already occurred at the start of the year", () => {
    // 2026 - 1955 = 71, birthday at the commencement of 2026-01-01.
    expect(ageAtBeginningOfYear("1955-01-01", 2026)).toBe(71);
  });

  it("a January 2 birthday has not, so the age is one lower", () => {
    // 2026 - 1955 - 1 = 70.
    expect(ageAtBeginningOfYear("1955-01-02", 2026)).toBe(70);
  });

  it("mid-year and December 31 birthdays count only completed birthdays", () => {
    expect(ageAtBeginningOfYear("1955-07-15", 2026)).toBe(70); // 2026 - 1955 - 1
    expect(ageAtBeginningOfYear("1954-12-31", 2026)).toBe(71); // 2026 - 1954 - 1
  });

  it("December 31 to January 1 rollover advances the age by exactly one", () => {
    expect(ageAtBeginningOfYear("1954-12-31", 2026)).toBe(71);
    expect(ageAtBeginningOfYear("1954-12-31", 2027)).toBe(72);
    expect(ageAtBeginningOfYear("1955-01-01", 2025)).toBe(70);
    expect(ageAtBeginningOfYear("1955-01-01", 2026)).toBe(71);
  });

  it("a February 29 birthday is treated like any other non-January-1 date", () => {
    expect(ageAtBeginningOfYear("1956-02-29", 2027)).toBe(70); // 2027 - 1956 - 1
    expect(ageAtBeginningOfYear("1956-02-29", 2028)).toBe(71); // leap year, same rule
  });

  it("someone born on January 1 of the year is 0 at its start", () => {
    expect(ageAtBeginningOfYear("2026-01-01", 2026)).toBe(0);
  });

  it("someone not yet born at the start of the year returns null", () => {
    expect(ageAtBeginningOfYear("2026-01-02", 2026)).toBeNull();
    expect(ageAtBeginningOfYear("2026-07-15", 2026)).toBeNull();
    expect(ageAtBeginningOfYear("2026-12-31", 2026)).toBeNull();
    expect(ageAtBeginningOfYear("2027-01-01", 2026)).toBeNull();
  });

  it("covers the 94/95 boundary year without capping", () => {
    expect(ageAtBeginningOfYear("1931-07-15", 2026)).toBe(94);
    expect(ageAtBeginningOfYear("1931-07-15", 2027)).toBe(95);
  });
});

describe("ageAttainedDuringYear: January 1 and year-boundary cases", () => {
  it("is year minus birth year regardless of birth month or day", () => {
    expect(ageAttainedDuringYear("1955-01-01", 2026)).toBe(71);
    expect(ageAttainedDuringYear("1955-01-02", 2026)).toBe(71);
    expect(ageAttainedDuringYear("1955-07-15", 2026)).toBe(71);
    expect(ageAttainedDuringYear("1955-12-31", 2026)).toBe(71);
    expect(ageAttainedDuringYear("1956-02-29", 2027)).toBe(71);
  });

  it("December 31 to January 1 rollover advances the age by exactly one", () => {
    expect(ageAttainedDuringYear("1954-12-31", 2026)).toBe(72);
    expect(ageAttainedDuringYear("1954-12-31", 2027)).toBe(73);
  });

  it("someone born during the year attains 0 that year", () => {
    expect(ageAttainedDuringYear("2026-01-01", 2026)).toBe(0);
    expect(ageAttainedDuringYear("2026-12-31", 2026)).toBe(0);
  });

  it("someone born after the year returns null", () => {
    expect(ageAttainedDuringYear("2027-01-01", 2026)).toBeNull();
  });
});

describe("start-of-year versus attained-during-year relationship", () => {
  const dobs = ["1955-01-01", "1955-01-02", "1955-07-15", "1954-12-31", "1956-02-29", "1960-03-01"];
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  it("the two bases coincide for a January 1 birthday and differ by one otherwise", () => {
    for (const dob of dobs) {
      const jan1 = dob.endsWith("-01-01");
      for (const year of years) {
        const start = ageAtBeginningOfYear(dob, year)!;
        const during = ageAttainedDuringYear(dob, year)!;
        expect(during - start, `${dob} in ${year}`).toBe(jan1 ? 0 : 1);
      }
    }
  });

  it("agree with ageFromDob evaluated on January 1 and December 31 of the year", () => {
    for (const dob of dobs) {
      for (const year of years) {
        expect(ageAtBeginningOfYear(dob, year), `${dob} start of ${year}`).toBe(
          ageFromDob(dob, localDate(year, 1, 1)),
        );
        expect(ageAttainedDuringYear(dob, year), `${dob} end of ${year}`).toBe(
          ageFromDob(dob, localDate(year, 12, 31)),
        );
      }
    }
  });
});

describe("statutory age helpers: input handling and clock independence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("return null for missing, malformed or non-calendar dates", () => {
    for (const fn of [ageAtBeginningOfYear, ageAttainedDuringYear]) {
      expect(fn(null, 2026)).toBeNull();
      expect(fn(undefined, 2026)).toBeNull();
      expect(fn("", 2026)).toBeNull();
      expect(fn("1955-7-15", 2026)).toBeNull();
      expect(fn("1955/07/15", 2026)).toBeNull();
      expect(fn("1955-02-30", 2026)).toBeNull();
      expect(fn("1955-13-01", 2026)).toBeNull();
      expect(fn("1955-00-10", 2026)).toBeNull();
      expect(fn("1955-02-29", 2026)).toBeNull(); // 1955 is not a leap year
      expect(fn("1900-02-29", 2026)).toBeNull(); // century, not a leap year
    }
    expect(ageAtBeginningOfYear("2000-02-29", 2026)).toBe(25); // 400-year leap
    expect(ageAttainedDuringYear("2000-02-29", 2026)).toBe(26);
  });

  it("return null for a non-finite year", () => {
    for (const fn of [ageAtBeginningOfYear, ageAttainedDuringYear]) {
      expect(fn("1955-07-15", Number.NaN)).toBeNull();
      expect(fn("1955-07-15", Number.POSITIVE_INFINITY)).toBeNull();
    }
  });

  it("accept surrounding whitespace in the date of birth", () => {
    expect(ageAtBeginningOfYear(" 1955-07-15 ", 2026)).toBe(70);
    expect(ageAttainedDuringYear(" 1955-07-15 ", 2026)).toBe(71);
  });

  it("do not depend on the system clock", () => {
    const run = () => [
      ageAtBeginningOfYear("1955-07-15", 2026),
      ageAttainedDuringYear("1955-07-15", 2026),
      ageAtBeginningOfYear("1955-01-01", 2026),
      ageAttainedDuringYear("1955-01-01", 2026),
    ];
    vi.useFakeTimers();
    vi.setSystemTime(localDate(2026, 3, 1));
    const beforeBirthday = run();
    vi.setSystemTime(localDate(2026, 11, 11));
    const afterBirthday = run();
    vi.setSystemTime(localDate(2031, 1, 1));
    const laterYear = run();
    expect(beforeBirthday).toEqual([70, 71, 71, 71]);
    expect(afterBirthday).toEqual(beforeBirthday);
    expect(laterYear).toEqual(beforeBirthday);
  });
});
