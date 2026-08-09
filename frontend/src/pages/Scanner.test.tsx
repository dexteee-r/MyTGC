import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { AuthProvider } from "../lib/auth";
import { CollectionProvider } from "../lib/collection";
import { LanguageProvider } from "../lib/language";
import { ToastProvider } from "../lib/toast";
import type { Card, ScanResult } from "../lib/types";
import { Scanner } from "./Scanner";

/* Emptying a binder means scanning fast, and the same card passes the lens twice more
   often than anyone admits. A duplicate that silently becomes a ×3 is a mistake nobody
   notices until the counts are wrong, so the scanner has to say what it already holds
   and let the user choose. */

const card: Card = {
  id: "OP01-001",
  language: "en",
  name: "Monkey.D.Luffy",
  pack_id: "569101",
  pack_code: "OP-01",
  pack_name: "ROMANCE DAWN",
  rarity: "Leader",
  category: "Leader",
  colors: ["Red"],
  cost: 5,
  power: 5000,
  counter: null,
  attributes: [],
  types: [],
  effect: null,
  trigger: null,
  image_url: "/images/en/OP01-001.png",
  printings: [],
};

const hit: ScanResult = {
  detected: true,
  confident: true,
  margin: 30,
  candidates: [
    {
      card_number: "OP01-001",
      language: "en",
      name: "Monkey.D.Luffy",
      distance: 16,
      printings: [
        {
          card_id: "OP01-001",
          pack_code: "OP-01",
          pack_name: "ROMANCE DAWN",
          rarity: "Leader",
        } as never,
      ],
      ambiguous_printing: false,
      card,
    },
  ],
  message: null,
};

function held(quantity: number) {
  return [
    {
      id: 1,
      card_id: "OP01-001",
      language: "en",
      quantity,
      condition: null,
      date_added: "2026-01-01",
      acquisition_price: null,
      card: null,
    },
  ];
}

function mount(collection: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            url.includes("/stats")
              ? {
                  distinct_cards: 0,
                  total_quantity: 0,
                  by_language: {},
                  by_rarity: {},
                  acquisition_total: 0,
                }
              : collection,
          text: async () => "",
        }) as Response,
    ),
  );

  const view = render(
    <MemoryRouter>
      {/* The edition is an account setting now, so the language provider reads the
          signed-in profile — which means it needs an auth context even in a test. */}
      <AuthProvider>
        <LanguageProvider>
          <CollectionProvider>
            <ToastProvider>
              <Scanner />
            </ToastProvider>
          </CollectionProvider>
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

  // jsdom has no camera, so the scanner opens in photo mode: hand it a file.
  const input = view.container.querySelector(
    "input[type=file]",
  ) as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(["x"], "card.jpg", { type: "image/jpeg" })] },
  });
  return view;
}

describe("scanner", () => {
  beforeEach(() => {
    vi.spyOn(api, "scan").mockResolvedValue(hit);
  });

  it("warns when the scanned card is already held, and offers both answers", async () => {
    mount(held(2));

    expect(
      await screen.findByText(/Déjà dans ta collection/),
    ).toHaveTextContent("×2");
    expect(
      screen.getByRole("button", { name: "Ajouter un exemplaire" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Passer" })).toBeInTheDocument();
    // The unconditional wording would be a lie about a card already in the binder.
    expect(
      screen.queryByRole("button", { name: "Ranger dans la collection" }),
    ).toBeNull();
  });

  it("adds nothing when the duplicate is passed over", async () => {
    const add = vi.spyOn(api, "addToCollection");
    mount(held(1));

    fireEvent.click(await screen.findByRole("button", { name: "Passer" }));

    await waitFor(() =>
      expect(screen.queryByText(/Déjà dans ta collection/)).toBeNull(),
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("asks plainly for a card that is not held yet", async () => {
    mount([]);

    expect(
      await screen.findByRole("button", { name: "Ranger dans la collection" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Déjà dans ta collection/)).toBeNull();
  });
});
