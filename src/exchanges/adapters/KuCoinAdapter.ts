import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class KuCoinAdapter extends CcxtAdapter {
  readonly slug = 'kucoin';
  readonly name = 'KuCoin';
  readonly baseUrl = 'https://api.kucoin.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.kucoin, 'kucoin', {
      options: {
        defaultType: 'spot',
        ...config.options,
      },
      ...config,
    });
  }

  protected override buildCapabilities(): AdapterCapabilities {
    const h = this.exchange.has;
    return {
      supportsSpot: !!h.spot,
      supportsFutures: !!h.swap,
      supportsMargin: !!h.margin,
      supportsWebSocket: false,
      supportsOrderBook: !!h.fetchOrderBook,
      supportsTicker: !!h.fetchTicker,
      supportsTrades: !!h.fetchTrades,
    };
  }

  /**
   * KuCoin only accepts limit values of 20 or 100 for order book depth.
   * Map the requested depth to the nearest valid value.
   */
  protected override validateOrderBookDepth(depth: number): number {
    // KuCoin accepts only 20 or 100
    if (depth <= 20) return 20;
    return 100;
  }
}
