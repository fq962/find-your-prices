/** Tipos que consume el panel de scraping. Espejo de las vistas y tablas. */

import type { ScrapeRunStatus, ScrapeTargetKind } from '@/server/scraping/types';

/** Una fila de find_your_prices.v_scrape_target_health. */
export interface TargetHealth {
  target_id: string;
  target_name: string;
  kind: ScrapeTargetKind;
  url: string | null;
  is_active: boolean;
  frequency_minutes: number | null;
  next_run_at: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: ScrapeRunStatus | null;
  consecutive_failures: number;
  paused_reason: string | null;
  store_id: string;
  store_slug: string;
  store_name: string;
  strategy_key: string;
  last_run_id: string | null;
  last_duration_ms: number | null;
  last_items_found: number | null;
  last_items_new: number | null;
  last_items_updated: number | null;
  last_price_changes: number | null;
  last_error_message: string | null;
  store_active_products: number;
}

export interface StoreOption {
  id: string;
  slug: string;
  name: string;
  strategy_key: string;
  is_active: boolean;
}

export interface StrategyOption {
  key: string;
  label: string;
  supports: ScrapeTargetKind[];
  configSchema: Array<{
    key: string;
    label: string;
    required?: boolean;
    example?: string;
    description?: string;
  }>;
}

export interface RunSummary {
  id: string;
  target_id: string | null;
  status: ScrapeRunStatus;
  trigger_source: string;
  started_at: string;
  duration_ms: number | null;
  items_found: number;
  items_new: number;
  items_updated: number;
  items_unchanged: number;
  items_delisted: number;
  price_changes: number;
  error_message: string | null;
}
