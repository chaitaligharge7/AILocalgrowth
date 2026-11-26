/** Optional billing add-ons (BW-119) — mirrors `App\Application\Billing\AddonService`. */
export interface BillingAddon {
  id: string;
  code: string;
  name: string;
  description: string;
  meter_code: string;
  quantity: number;
  /** Decimal string (never a float). */
  price: string;
  currency: string;
  status: string;
}

export type AddonPurchaseStatus = 'pending' | 'paid' | 'cancelled';

export interface AddonPurchase {
  id: string;
  addon_id: string;
  addon_code: string | null;
  addon_name: string | null;
  meter_code: string | null;
  quantity: number;
  amount: string;
  currency: string;
  status: AddonPurchaseStatus;
  provider: string;
  /** True when the payment was simulated by the mock provider (MOCK_PROVIDER). */
  mock_provider: boolean;
  created_at: string;
  paid_at: string | null;
}

export interface AddonCatalog {
  mock_provider: boolean;
  addons: BillingAddon[];
  purchases: AddonPurchase[];
}
