process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

import { parseModernPayload } from "@/app/api/eduzz/webhook/route";
import { mapApiSaleToModernPayload, mapApiSubscriptionToContractPayload } from "@/lib/eduzzSync";
import type { EduzzApiSale, EduzzApiSubscription } from "@/lib/eduzzOAuth";

// Shape baseado nos campos confirmados na doc oficial (GET /myeduzz/v1/sales/:id).
const apiSale: EduzzApiSale = {
  id: 123456,
  contractId: null,
  status: "paid",
  total: 297,
  netGain: 250,
  grossGain: 297,
  paidAt: "2026-06-20T10:00:00Z",
  payment: { method: "credit_card" },
  product: { id: 2944992, name: "Treinamento Feminino" },
  items: [{ productId: 2944992, name: "Treinamento Feminino" }],
  buyer: {
    name: "Maria Souza",
    email: "maria@example.com",
    phone: "11999998888",
    address: { city: "São Paulo", state: "SP", zipcode: "01000-000", country: "BR" },
  },
  utm: { source: "facebook", campaign: "camp1", medium: "cpc", content: "ad1", term: "termo" },
  orderBump: { has: false },
};

const apiSubscription: EduzzApiSubscription = {
  id: 4027817,
  createdAt: "2026-01-10T00:00:00Z",
  status: "active",
  charges: { current: 3, total: 19 },
  products: [{ id: 2915528, name: "Treinamento Feminino" }],
  price: { currency: "BRL", value: 197 },
  client: { name: "Maria Souza", email: "maria@example.com" },
};

describe("mapApiSaleToModernPayload", () => {
  it("monta um EduzzModernPayload que o parseModernPayload já existente entende", () => {
    const payload = mapApiSaleToModernPayload(apiSale);
    const result = parseModernPayload(payload);

    expect("ignored" in result).toBe(false);
    if ("ignored" in result) return;

    expect(result.transactionId).toBe("123456");
    expect(result.value).toBe(297);
    expect(result.invoiceValue).toBe(297);
    expect(result.email).toBe("maria@example.com");
    expect(result.phone).toBe("11999998888");
    expect(result.name).toBe("Maria Souza");
    expect(result.productName).toBe("Treinamento Feminino");
    expect(result.address).toEqual({ city: "São Paulo", state: "SP", country: "BR", zip: "01000-000" });
    expect(result.utm).toEqual({ source: "facebook", medium: "cpc", campaign: "camp1", content: "ad1", term: "termo" });
    expect(result.recurrenceKey).toBeNull(); // contractId null nesta venda
    expect(result.isOrderBump).toBe(false);
    expect(result.items[0]).toMatchObject({ productId: "2944992", name: "Treinamento Feminino", value: 297 });
  });

  it("propaga contractId como recurrenceKey quando a venda é de uma assinatura", () => {
    const result = parseModernPayload(mapApiSaleToModernPayload({ ...apiSale, contractId: 4027817 }));
    expect("ignored" in result).toBe(false);
    if ("ignored" in result) return;
    expect(result.recurrenceKey).toBe("4027817");
  });

  it("ignora venda sem valor (status pendente sem total/netGain/grossGain)", () => {
    const result = parseModernPayload(mapApiSaleToModernPayload({ ...apiSale, total: undefined, netGain: undefined, grossGain: undefined }));
    expect("ignored" in result).toBe(true);
  });
});

describe("mapApiSubscriptionToContractPayload", () => {
  it("monta um EduzzContractPayload com a ficha de cobranças da assinatura", () => {
    const payload = mapApiSubscriptionToContractPayload(apiSubscription);

    expect(payload.event).toBe("myeduzz.contract_updated");
    expect(payload.data?.customer?.email).toBe("maria@example.com");
    expect(payload.data?.products?.[0]?.id).toBe("2915528");
    expect(payload.data?.contract).toMatchObject({
      id: "4027817",
      recurrence: {
        isFinite: true,
        price: { value: 197, currency: "BRL" },
        charges: { current: 3, total: 19 },
        startsAt: "2026-01-10T00:00:00Z",
      },
    });
  });

  it("marca isFinite=false quando a assinatura não tem charges.total (aberta)", () => {
    const payload = mapApiSubscriptionToContractPayload({ ...apiSubscription, charges: { current: 3 } });
    expect(payload.data?.contract?.recurrence?.isFinite).toBe(false);
  });
});
