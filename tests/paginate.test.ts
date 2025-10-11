import { describe, test, expect } from "@jest/globals";
import { chunkLines } from "../src/ui/paginate.js";

describe("Pagination Utility", () => {
  test("chunkLines returns single page for short content", () => {
    const lines = ["Line 1", "Line 2", "Line 3"];
    const pages = chunkLines(lines, 1000);
    expect(pages.length).toBe(1);
    expect(pages[0]).toBe("Line 1\nLine 2\nLine 3");
  });

  test("chunkLines splits into multiple pages when content exceeds max", () => {
    // Create lines that will exceed the limit
    const lines = Array(100).fill("A".repeat(50)); // 100 lines of 50 chars each
    const pages = chunkLines(lines, 1000);
    expect(pages.length).toBeGreaterThan(1);

    // Each page should be under the limit
    pages.forEach((page) => {
      expect(page.length).toBeLessThanOrEqual(1000);
    });
  });

  test("chunkLines handles empty array", () => {
    const pages = chunkLines([], 1000);
    expect(pages).toEqual([]);
  });

  test("chunkLines handles single line", () => {
    const pages = chunkLines(["Single line"], 1000);
    expect(pages.length).toBe(1);
    expect(pages[0]).toBe("Single line");
  });

  test("chunkLines preserves line content", () => {
    const lines = ["First", "Second", "Third"];
    const pages = chunkLines(lines, 1000);
    const reconstructed = pages.join("\n").split("\n");
    expect(reconstructed).toEqual(lines);
  });

  test("chunkLines handles very long single line", () => {
    const longLine = "A".repeat(2000);
    const pages = chunkLines([longLine], 1000);
    // Single line longer than max goes in its own page
    expect(pages.length).toBe(1);
    expect(pages[0]).toBe(longLine);
  });

  test("chunkLines respects custom max length", () => {
    const lines = Array(20).fill("X".repeat(40)); // 20 lines of 40 chars
    const pages = chunkLines(lines, 200);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page) => {
      expect(page.length).toBeLessThanOrEqual(200);
    });
  });

  test("chunkLines accounts for newline characters in length", () => {
    const lines = ["A".repeat(100), "B".repeat(100)];
    const pages = chunkLines(lines, 150);
    // Should split because 100 + 1 (newline) + 100 = 201 > 150
    expect(pages.length).toBe(2);
  });

  test("chunkLines with default max value", () => {
    const lines = Array(50).fill("Test line content");
    const pages = chunkLines(lines); // Should use default 1900
    expect(Array.isArray(pages)).toBe(true);
    pages.forEach((page) => {
      expect(page.length).toBeLessThanOrEqual(1900);
    });
  });
});
