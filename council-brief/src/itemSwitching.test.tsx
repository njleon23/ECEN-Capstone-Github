// Regression tests for PR #24 review feedback: unsaved edits and late save responses must stay with the item
// they belong to when the reviewer switches to another item.

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import App from "./App"
import { ITEM_A, ITEM_B, installFakeBackend } from "./test/fakeBackend"

type Backend = ReturnType<typeof installFakeBackend>
let backend: Backend

async function openApp() {
  const user = userEvent.setup()
  render(<App />)
  await screen.findAllByText(ITEM_A.title)
  // Sign in through the header button, as a reviewer would.
  await user.click(screen.getAllByRole("button", { name: /sign in/i })[0])
  await user.type(await screen.findByPlaceholderText("Enter username"), "tester")
  await user.type(screen.getByPlaceholderText("••••••••"), "a-long-test-password")
  await user.click(screen.getAllByRole("button", { name: /^sign in$/i }).at(-1)!)
  await screen.findByRole("button", { name: /sign out/i })
  return user
}

async function openItem(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getAllByText(title)[0])
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole("tab", { name }))
}

const commentBox = () => screen.getByPlaceholderText(/add internal notes/i) as HTMLTextAreaElement
const approve = () => screen.getByRole("button", { name: /approve briefing/i })
const reviewHistory = () => screen.queryByLabelText("Review history")

beforeEach(() => {
  vi.restoreAllMocks()
  backend = installFakeBackend()
})

describe("unsaved review comment", () => {
  it("does not carry from item A to item B or get submitted for B", async () => {
    const user = await openApp()
    await openItem(user, ITEM_A.title)
    await openTab(user, /briefing/i)
    await user.type(commentBox(), "Comment for A only")

    await openItem(user, ITEM_B.title)
    await openTab(user, /briefing/i)
    expect(commentBox().value).toBe("")

    await user.click(approve())
    await waitFor(() => expect(backend.reviewRequests).toHaveLength(1))
    expect(backend.reviewRequests[0]).toMatchObject({ briefingId: ITEM_B.briefingId, comments: "" })
  })

  it("is still there when the reviewer comes back to item A", async () => {
    const user = await openApp()
    await openItem(user, ITEM_A.title)
    await openTab(user, /briefing/i)
    await user.type(commentBox(), "Comment for A only")
    await openItem(user, ITEM_B.title)
    await openItem(user, ITEM_A.title)
    await openTab(user, /briefing/i)
    expect(commentBox().value).toBe("Comment for A only")
  })
})

describe("unsaved factor edits", () => {
  it("do not carry from item A to item B when both have the same factor value", async () => {
    const user = await openApp()
    await openItem(user, ITEM_A.title)
    await openTab(user, /priority factors/i)
    // Factor 2 (opposition in similar past items) is 0 for both items.
    const sliderA = screen.getAllByRole("slider")[1]
    sliderA.focus()
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}")
    await user.type(await screen.findByPlaceholderText(/for example/i), "Reason for A only")
    expect(screen.getAllByRole("slider")[1]).toHaveAttribute("aria-valuenow", "0.4")

    await openItem(user, ITEM_B.title)
    await openTab(user, /priority factors/i)
    expect(screen.getAllByRole("slider")[1]).toHaveAttribute("aria-valuenow", "0")
    expect(screen.queryByPlaceholderText(/for example/i)).not.toBeInTheDocument()
    expect(backend.adjustmentRequests).toHaveLength(0)
  })

  it("are saved against the item they were made on", async () => {
    const user = await openApp()
    await openItem(user, ITEM_A.title)
    await openTab(user, /priority factors/i)
    screen.getAllByRole("slider")[1].focus()
    await user.keyboard("{ArrowRight}{ArrowRight}")
    await user.type(await screen.findByPlaceholderText(/for example/i), "Reason for A")
    await user.click(screen.getByRole("button", { name: /save adjustment/i }))
    await waitFor(() => expect(backend.adjustmentRequests).toHaveLength(1))
    expect(backend.adjustmentRequests[0]).toMatchObject({ itemId: ITEM_A.id, factorKey: "historical_opposition", reason: "Reason for A" })
  })
})

describe("a review that finishes after the reviewer switched items", () => {
  it("is added to item A's history, not item B's, and leaves B's unsaved comment alone", async () => {
    const user = await openApp()
    backend.holdReview(ITEM_A.briefingId)
    await openItem(user, ITEM_A.title)
    await openTab(user, /briefing/i)
    await user.type(commentBox(), "Late review of A")
    await user.click(approve())
    await waitFor(() => expect(backend.reviewRequests).toHaveLength(1))

    // The save for A is still running. Open B and start a comment there.
    await openItem(user, ITEM_B.title)
    await openTab(user, /briefing/i)
    await user.type(commentBox(), "Draft for B")

    await act(async () => { backend.releaseReview(ITEM_A.briefingId) })
    await waitFor(() => expect(screen.queryByText("Late review of A")).not.toBeInTheDocument())

    // B shows no review from A, and B's draft is untouched.
    expect(reviewHistory()).not.toBeInTheDocument()
    expect(commentBox().value).toBe("Draft for B")

    // The review is in A's history.
    await openItem(user, ITEM_A.title)
    await openTab(user, /briefing/i)
    const history = await screen.findByLabelText("Review history")
    expect(within(history).getByText("Late review of A")).toBeInTheDocument()
  })
})

describe("an adjustment that finishes after the reviewer switched items", () => {
  it("is added to item A's history, not item B's", async () => {
    const user = await openApp()
    backend.holdAdjustment(ITEM_A.id)
    await openItem(user, ITEM_A.title)
    await openTab(user, /priority factors/i)
    screen.getAllByRole("slider")[1].focus()
    await user.keyboard("{ArrowRight}{ArrowRight}")
    await user.type(await screen.findByPlaceholderText(/for example/i), "Late adjustment of A")
    await user.click(screen.getByRole("button", { name: /save adjustment/i }))
    await waitFor(() => expect(backend.adjustmentRequests).toHaveLength(1))

    await openItem(user, ITEM_B.title)
    await openTab(user, /priority factors/i)
    await act(async () => { backend.releaseAdjustment(ITEM_A.id) })
    await waitFor(() => expect(backend.adjustmentRequests).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(screen.queryByText("Late adjustment of A")).not.toBeInTheDocument()
    await openItem(user, ITEM_A.title)
    await openTab(user, /priority factors/i)
    expect(await screen.findByText("Late adjustment of A")).toBeInTheDocument()
  })
})
