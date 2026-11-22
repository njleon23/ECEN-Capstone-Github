// Per-item bookkeeping for things that are still unsaved or still loading.
//
// The page shows one agenda item at a time, but saves and loads finish later, after the reviewer may have
// opened a different item. Everything here is keyed by the item (and, for review comments, by the briefing),
// so a draft or a late response can only ever touch the item it was made for.

export type ByItem<T> = Record<string, T>

/** Unsaved review comments belong to one briefing of one item. A new analysis makes a new briefing, so an old comment is not carried over. */
export function commentKey(itemId: string, briefingId?: string | null): string {
  return `${itemId}::${briefingId ?? "no-briefing"}`
}

/** Returns a copy of `map` with `record` added to the end of that item's list. Other items are untouched. */
export function appendFor<T>(map: ByItem<T[]>, itemId: string, record: T): ByItem<T[]> {
  return { ...map, [itemId]: [...(map[itemId] ?? []), record] }
}

/** Returns a copy of `map` with that item's value replaced. Other items are untouched. */
export function setFor<T>(map: ByItem<T>, itemId: string, value: T): ByItem<T> {
  return { ...map, [itemId]: value }
}

/** Returns a copy of `map` without the given key. */
export function removeKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = map
  return rest
}

/** Key for one factor control. A different item, a different analysis run or a different factor gets a fresh control with no leftover edits. */
export function factorControlKey(itemId: string, jobId: string | null | undefined, factorKey: string): string {
  return `${itemId}::${jobId ?? "no-job"}::${factorKey}`
}
