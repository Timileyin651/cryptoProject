import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class BybitAdapter extends CcxtAdapter {
  readonly slug = 'bybit';
  readonly name = 'Bybit';
  readonly baseUrl = 'https://api.bybit.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.bybit, 'bybit', {
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
}
