import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class MexcAdapter extends CcxtAdapter {
  readonly slug = 'mexc';
  readonly name = 'MEXC';
  readonly baseUrl = 'https://api.mexc.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.mexc, 'mexc', {
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
