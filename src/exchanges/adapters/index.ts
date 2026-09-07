import { ExchangeAdapter, AdapterRegistry } from '../ExchangeAdapter';
import { CcxtConfig } from '../CcxtAdapter';
import { BinanceAdapter } from './BinanceAdapter';
import { BybitAdapter } from './BybitAdapter';
import { OkxAdapter } from './OkxAdapter';
import { KuCoinAdapter } from './KuCoinAdapter';
import { GateIoAdapter } from './GateIoAdapter';
import { MexcAdapter } from './MexcAdapter';
import { BitgetAdapter } from './BitgetAdapter';

/** All supported exchange slugs in the order they are presented to users. */
export const SUPPORTED_EXCHANGES = [
  'binance',
  'bybit',
  'okx',
  'kucoin',
  'gateio',
  'mexc',
  'bitget',
] as const;

export type SupportedExchangeSlug = (typeof SUPPORTED_EXCHANGES)[number];

/**
 * Factory map — maps a slug to its adapter constructor.
 * Every entry here must accept a CcxtConfig and return an ExchangeAdapter.
 */
const ADAPTER_MAP: Record<SupportedExchangeSlug, new (config?: CcxtConfig) => ExchangeAdapter> = {
  binance: BinanceAdapter,
  bybit: BybitAdapter,
  okx: OkxAdapter,
  kucoin: KuCoinAdapter,
  gateio: GateIoAdapter,
  mexc: MexcAdapter,
  bitget: BitgetAdapter,
};

/**
 * Create an adapter instance for a given exchange slug.
 * Returns `null` when the slug is not in the supported set.
 */
export function createAdapter(slug: string, config?: CcxtConfig): ExchangeAdapter | null {
  const Factory = ADAPTER_MAP[slug as SupportedExchangeSlug];
  if (!Factory) return null;
  return new Factory(config);
}

/**
 * Create all supported adapters in one shot.
 * Each exchange can optionally receive per-exchange config (API keys etc.).
 * Public market data does NOT need any keys.
 */
export function createAllAdapters(
  configs?: Partial<Record<SupportedExchangeSlug, CcxtConfig>>,
): ExchangeAdapter[] {
  return SUPPORTED_EXCHANGES.map((slug) => createAdapter(slug, configs?.[slug])).filter(
    Boolean,
  ) as ExchangeAdapter[];
}

export {
  BinanceAdapter,
  BybitAdapter,
  OkxAdapter,
  KuCoinAdapter,
  GateIoAdapter,
  MexcAdapter,
  BitgetAdapter,
};
