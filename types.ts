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
}

export type ApiProviderType = 'blackbox';

export interface ApiProviderConfig {
  id: ApiProviderType;
  name: string;
  apiKey: string;
  isEnabled: boolean;
  model: string;
}

export interface AppSettings {
  providers: ApiProviderConfig[];
}