import { describe, expect, it } from "vitest";
import { packClient, packProductPresentations, packSupplier, unpackClient, unpackProductPresentations, unpackSupplier } from "@/lib/meta";
import { stockBreakdown } from "@/lib/pricing";

describe("Optional metadata packing/unpacking", () => {
  it("keeps product presentations clean while preserving optional metadata", () => {
    const packed = packProductPresentations(
      [{ name: "Caja", qty: 12, price_detal: 24, price_mayor: 20 }],
      { brand: "Plumrose", barcode: "759001", location: "Cava 1", notes: "Refrigerado" },
    );
    const { presentations, meta } = unpackProductPresentations(packed);
    expect(presentations).toEqual([{ name: "Caja", qty: 12, price_detal: 24, price_mayor: 20 }]);
    expect(meta).toEqual({ brand: "Plumrose", barcode: "759001", location: "Cava 1", notes: "Refrigerado" });
    expect(stockBreakdown(26, "und", presentations)).toBe("2 cajas + 2 und");
  });

  it("packs and unpacks client and supplier optional details without losing address", () => {
    const cRaw = packClient("Av. Bolívar 45", { contact: "María", email: "m@test.com", zone: "Centro" });
    const cOut = unpackClient(cRaw);
    expect(cOut.address).toBe("Av. Bolívar 45");
    expect(cOut.meta).toEqual({ contact: "María", email: "m@test.com", zone: "Centro" });

    const sRaw = packSupplier("", { contact: "José", terms: "15 días", notes: "Lácteos" });
    const sOut = unpackSupplier(sRaw);
    expect(sOut.address).toBe("");
    expect(sOut.meta).toEqual({ contact: "José", terms: "15 días", notes: "Lácteos" });
  });
});
