export interface AdAnalysis {
  item_detected: boolean; // True if a valid sellable item is found
  title: string;
  price_estimate: string; // e.g., "150€ - 200€"
  condition: string; // e.g., "Gut", "Neu", "Gebraucht"
  category: string;
  description: string;
  keywords: string[];
  reasoning: string; // Brief explanation of the valuation
  brand_detected?: string;
  shipping_cost?: string;
  weight_estimate?: string;
  high_value_attributes?: string[];
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  ANALYTICS = 'ANALYTICS',
  SCANNER = 'SCANNER',
  RESULTS = 'RESULTS',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS'
}

export interface HistoryItem {
  id: string;
  image: string; // The main thumbnail/hero image
  additionalImages?: string[]; // Array of extra images
  date: string;
  analysis: AdAnalysis;
  traderaListing?: TraderaListingResult;
}

export type ApiProviderType = 'opencode' | 'gemini' | 'openrouter' | 'blackbox';

export interface ApiProviderConfig {
  id: ApiProviderType;
  name: string;
  apiKey: string;
  isEnabled: boolean;
  model: string;
  baseUrl?: string;
  description?: string;
}

export interface TraderaConfig {
  appId: string;
  appKey: string;
  publicKey: string;
  authorizationUrl: string;
  redirectUri?: string;
  token: string;
  userId: string;
  tokenExpires?: string;
  isConnected: boolean;
  defaultItemType: 1 | 3; // 1 = Auction, 3 = Fixed Price (Endast Köp Nu)
  defaultDuration: number; // 7, 10, 14, 30
  defaultShippingProviderId: number; // 6 = Annat fraktsätt, 2 = DHL, 8 = Avhämtning
  defaultShippingCost: number; // in SEK
  autoCommit: boolean;
  currencyRateEurToSek: number; // default ~11.5 SEK/EUR
}

export interface TraderaCategory {
  id: number;
  name: string;
  fullName?: string;
}

export interface TraderaListingResult {
  requestId: number;
  itemId: number;
  url: string;
  title: string;
  price: number;
  isDraft: boolean;
}

export interface AppSettings {
  providers: ApiProviderConfig[];
  tradera?: TraderaConfig;
}