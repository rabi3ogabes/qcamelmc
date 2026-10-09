// Test doubles shared by the edge-function handler tests.
import type {
  CreateOrderArgs,
  CreatedOrder,
  OrderContext,
  PaymentErrorRow,
  QrStorage,
  Repo,
} from "../../supabase/functions/_shared/repo.ts";
import type { PaymentEvent, PaymentOrder } from "../../supabase/functions/_shared/payment-processor.ts";
import type { PrivateSettings } from "../../supabase/functions/_shared/settings.ts";

export const SUPABASE_URL = "https://proj.supabase.co";
export const T1 = "11111111-1111-4111-8111-111111111111";
export const T2 = "22222222-2222-4222-8222-222222222222";

export const configuredSettings = (over: Partial<PrivateSettings> = {}): PrivateSettings => ({
  webhookUrl: "https://n8n.example/hook",
  emailWebhookUrl: null,
  adminPhone: "+974 5550 0000",
  merchantId: "1664851",
  secret: "S3CR3T",
  apiKey: null,
  websiteDomain: "example.qa",
  environment: "auto",
  siteUrl: null,
  ...over,
});

export const validBody = (over: Record<string, unknown> = {}) => ({
  customer: {
    name: "Ahmed Al-Thani",
    email: "ahmed@example.com",
    phone: "5551 2345",
    country_code: "+974",
    nationality: "قطر",
    id_number: "29850123456",
  },
  items: [{ ticket_id: T1, quantity: 2 }],
  holders: [
    { ticket_id: T1, name: "Ahmed Al-Thani", phone: "+974 5551 2345", nationality: "قطر", id_number: "29850123456" },
    { ticket_id: T1, name: "Sara Al-Thani", phone: "+974 5551 9999", nationality: "قطر", id_number: "29850123999" },
  ],
  payment_method: "sadad",
  ...over,
});

export interface FakeRepo extends Repo {
  calls: {
    createOrder: CreateOrderArgs[];
    setQrImageUrl: [string, string][];
    confirm: [string, string][];
    fail: [string, string][];
    events: PaymentEvent[];
    paymentErrors: PaymentErrorRow[];
    pending: { orderId: string | null; bookingReference: string | null; message: string }[];
  };
}

export function makeRepo(over: Partial<Repo> & { settings?: PrivateSettings; orders?: Record<string, PaymentOrder>; context?: OrderContext | null; openOrders?: number } = {}): FakeRepo {
  const calls: FakeRepo["calls"] = { createOrder: [], setQrImageUrl: [], confirm: [], fail: [], events: [], paymentErrors: [], pending: [] };
  const settings = over.settings ?? configuredSettings();
  const orders = over.orders ?? {};
  const repo: FakeRepo = {
    calls,
    getUserId: async (jwt) =>
      jwt === "admin-jwt" ? "admin-1" : jwt === "member-jwt" ? "member-1" : jwt === "mod-jwt" ? "mod-1" : null,
    isAdmin: async (id) => id === "admin-1",
    isModerator: async (id) => id === "mod-1",
    getPrivateSettings: async () => settings,
    createOrder: async (a: CreateOrderArgs): Promise<CreatedOrder> => {
      calls.createOrder.push(a);
      const qty = a.items.reduce((s, i) => s + Number(i.quantity), 0);
      return {
        order_id: "order-1",
        booking_reference: a.source === "pos" ? "POS-AAAAAAAAAAAA" : "QTR-AAAAAAAAAAAA",
        total_amount: qty * 100,
        payment_method: a.paymentMethod,
        payment_status: a.source === "pos" ? "confirmed" : "pending",
        payment_expires_at: null,
        event_id: "event-1",
        items: [{ ticket_id: T1, type: "vip", price: 100, quantity: qty }],
        holders: Array.from({ length: qty }, (_, i) => ({
          id: `holder-${i + 1}`,
          qr_code: `${a.source === "pos" ? "POS" : "QTR"}-AAAAAAAAAAAA-TKT0${i + 1}`,
          ticket_type: "vip",
          name: `Holder ${i + 1}`,
        })),
      };
    },
    countOpenOrders: async () => over.openOrders ?? 0,
    setQrImageUrl: async (id, url) => {
      calls.setQrImageUrl.push([id, url]);
    },
    getPaymentOrder: async (ref) => orders[ref] ?? null,
    getOrderContext: async () => over.context ?? null,
    confirmOrderPayment: async (ref, txn) => {
      calls.confirm.push([ref, txn]);
      return { result: "confirmed" };
    },
    failOrderPayment: async (ref, note) => {
      calls.fail.push([ref, note]);
      return { result: "failed" };
    },
    claimPaymentCheck: async () => ({ order_id: "order-1" }),
    logPaymentEvent: async (e) => {
      calls.events.push(e);
    },
    markAutomationPending: async (args) => {
      calls.pending.push(args);
    },
    recordPaymentError: async (row) => {
      calls.paymentErrors.push(row);
    },
    listHoldersMissingQrImage: async () => [],
    listBookingHolders: async () => null,
    ...over,
  } as FakeRepo;
  return repo;
}

export const fakeStorage = (): QrStorage & { uploads: string[] } => {
  const uploads: string[] = [];
  return {
    uploads,
    uploadPng: async (name) => {
      uploads.push(name);
      return `${SUPABASE_URL}/storage/v1/object/public/qr-codes/${name}`;
    },
  };
};

export const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

export const fn = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

export const formPost = (url: string, fields: Record<string, string>) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
