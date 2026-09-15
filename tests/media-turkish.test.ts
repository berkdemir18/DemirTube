import { describe, expect, it } from "vitest";
import { percentWith, suffix } from "../src/media/turkish";

describe("sayılara Türkçe ek", () => {
  it.each([
    [29, "possessive", "%29'u"],
    [40, "possessive", "%40'ı"],
    [2, "possessive", "%2'si"],
    [100, "possessive", "%100'ü"],
    [45, "possessive-locative", "%45'inde"],
    [90, "possessive-locative", "%90'ında"],
    [30, "possessive-locative", "%30'unda"],
    [47, "possessive-locative", "%47'sinde"],
    [6, "possessive-locative", "%6'sında"],
    [67, "possessive-accusative", "%67'sini"],
    [50, "possessive-accusative", "%50'sini"],
    [0, "possessive-accusative", "%0'ını"],
    [38, "locative", "%38'de"],
    [40, "locative", "%40'ta"],
    [3, "locative", "%3'te"],
    [60, "locative", "%60'ta"],
  ] as const)("%i · %s → %s", (value, kind, expected) => {
    expect(percentWith(value, kind)).toBe(expected);
  });

  it("yönelme eki", () => {
    expect(suffix(12, "dative")).toBe("ye");
    expect(suffix(3, "dative")).toBe("e");
    expect(suffix(6, "dative")).toBe("ya");
  });
});
