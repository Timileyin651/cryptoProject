import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class BitgetAdapter extends CcxtAdapter {
  readonly slug = 'bitget';
  readonly name = 'Bitget';
  readonly baseUrl = 'https://api.bitget.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.bitget, 'bitget', {
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
