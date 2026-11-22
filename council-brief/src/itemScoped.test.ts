import { describe, expect, it } from "vitest"

import { appendFor, commentKey, factorControlKey, removeKey, setFor } from "./itemScoped"

describe("item scoped helpers", () => {
  it("gives a different comment key to a different item or a different briefing", () => {
    expect(commentKey("a", "b1")).not.toBe(commentKey("b", "b1"))
    expect(commentKey("a", "b1")).not.toBe(commentKey("a", "b2"))
    expect(commentKey("a", null)).toBe(commentKey("a", undefined))
  })

  it("adds a record to one item's list and leaves other items alone", () => {
    const before = { a: [1], b: [2] }
    const after = appendFor(before, "a", 3)
    expect(after).toEqual({ a: [1, 3], b: [2] })
    expect(before).toEqual({ a: [1], b: [2] })
  })

  it("starts a list for an item that has none", () => {
    expect(appendFor({}, "a", 1)).toEqual({ a: [1] })
  })

  it("replaces one item's value only", () => {
    expect(setFor({ a: [1], b: [2] }, "a", [9])).toEqual({ a: [9], b: [2] })
  })

  it("removes one key only", () => {
    expect(removeKey({ a: "x", b: "y" }, "a")).toEqual({ b: "y" })
  })

  it("gives each item, analysis run and factor its own control key", () => {
    const base = factorControlKey("a", "job1", "cost")
    expect(factorControlKey("b", "job1", "cost")).not.toBe(base)
    expect(factorControlKey("a", "job2", "cost")).not.toBe(base)
    expect(factorControlKey("a", "job1", "topic")).not.toBe(base)
  })
})
