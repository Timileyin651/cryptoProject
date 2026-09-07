import ccxt from 'ccxt';
import { CcxtAdapter, CcxtConfig } from '../CcxtAdapter';
import { AdapterCapabilities } from '../ExchangeAdapter';

export class GateIoAdapter extends CcxtAdapter {
  readonly slug = 'gateio';
  readonly name = 'Gate.io';
  readonly baseUrl = 'https://api.gateio.ws';

  constructor(config: CcxtConfig = {}) {
    super(ccxt.gate, 'gateio', {
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
