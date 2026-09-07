import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class OkxAdapter extends CcxtAdapter {
  readonly slug = 'okx';
  readonly name = 'OKX';
  readonly baseUrl = 'https://www.okx.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.okx, 'okx', {
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
