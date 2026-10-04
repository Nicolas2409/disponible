import { describe, expect, it } from "vitest";
import { addMonths, compareMonths, currentMonth, formatMonth, formatMonthShort, monthDiff } from "./month";

describe("month", () => {
  it("currentMonth tiene formato YYYY-MM", () => {
    expect(currentMonth()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("addMonths cruza años en ambos sentidos", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 12)).toBe("2027-12");
    expect(addMonths("2026-05", 0)).toBe("2026-05");
    expect(addMonths("2026-03", -27)).toBe("2023-12");
  });

  it("monthDiff = b − a", () => {
    expect(monthDiff("2026-10", "2027-03")).toBe(5);
    expect(monthDiff("2027-03", "2026-10")).toBe(-5);
    expect(monthDiff("2026-10", "2026-10")).toBe(0);
  });

  it("compareMonths", () => {
    expect(compareMonths("2026-01", "2026-02")).toBeLessThan(0);
    expect(compareMonths("2027-01", "2026-12")).toBeGreaterThan(0);
    expect(compareMonths("2026-06", "2026-06")).toBe(0);
  });

  it("formatMonth / formatMonthShort en español", () => {
    expect(formatMonth("2026-10")).toBe("octubre 2026");
    expect(formatMonthShort("2026-10")).toBe("oct");
    expect(formatMonth("2027-01")).toBe("enero 2027");
  });

  it("rechaza claves inválidas", () => {
    expect(() => addMonths("2026-1", 1)).toThrow();
  });
});
