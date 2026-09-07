import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class BinanceAdapter extends CcxtAdapter {
  readonly slug = 'binance';
  readonly name = 'Binance';
  readonly baseUrl = 'https://api.binance.com';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.binance, 'binance', {
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
      supportsFutures: !!h.future || !!h.swap,
      supportsMargin: !!h.margin,
      // Binance has WS in CCXT but it's experimental — disable until stable
      supportsWebSocket: false,
      supportsOrderBook: !!h.fetchOrderBook,
      supportsTicker: !!h.fetchTicker,
      supportsTrades: !!h.fetchTrades,
    };
  }
}
