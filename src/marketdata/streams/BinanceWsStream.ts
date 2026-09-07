import WebSocket from 'ws';
import { WsStream } from '../WsStream';
import { NormalizedTicker, NormalizedTrade, NormalizedSymbol } from '../types';

const WS_URL = 'wss://stream.binance.com:9443/ws';

/**
 * Translates Binance's native WebSocket format into normalised events.
 *
 * Binance uses combined streams:
 *   wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker
 *
 * Each message is:
 *   { "e": "24hrTicker", "s": "BTCUSDT", ... }
 *   { "e": "trade", "s": "BTCUSDT", ... }
 */
export class BinanceWsStream extends WsStream {
  constructor() {
    super({ exchange: 'binance', url: WS_URL, heartbeatTimeoutMs: 60_000 });
  }

  /** Map our BASE/QUOTE → Binance lowercase symbol (BTC/USDT → btcusdt). */
  private toExchangeSymbol(normalized: string): string {
    return normalized.replace('/', '').toLowerCase();
  }

  /** Map Binance symbol → our normalized symbol (BTCUSDT → BTC/USDT). */
  private toNormalizedSymbol(exchangeSymbol: string): NormalizedSymbol {
    // Binance symbols end with known quote currencies
    const quotes = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'AUD', 'FDUSD'];
    for (const q of quotes) {
      if (exchangeSymbol.endsWith(q) && exchangeSymbol.length > q.length) {
        return exchangeSymbol.slice(0, -q.length) + '/' + q;
      }
    }
    // Fallback: assume last 4 chars are quote
    return exchangeSymbol.slice(0, -4) + '/' + exchangeSymbol.slice(-4);
  }

  protected buildSubscribeMessage(symbols: string[]): unknown {
    const streams = symbols.map((s) => `${this.toExchangeSymbol(s)}@ticker`);
    return { method: 'SUBSCRIBE', params: streams, id: Date.now() };
  }

  protected buildUnsubscribeMessage(symbols: string[]): unknown {
    const streams = symbols.map((s) => `${this.toExchangeSymbol(s)}@ticker`);
    return { method: 'UNSUBSCRIBE', params: streams, id: Date.now() };
  }

  protected parseMessage(data: WebSocket.Data): void {
    const raw = data.toString();
    const msg = JSON.parse(raw);

    // Skip subscription confirmations
    if (msg.result !== undefined || msg.id !== undefined) return;

    // Handle combined stream envelope
    if (msg.stream && msg.data) {
      this.handleStreamMessage(msg.stream, msg.data);
      return;
    }

    // Handle direct messages
    if (msg.e) {
      this.handleStreamMessage(msg.e, msg);
    }
  }

  private handleStreamMessage(stream: string, data: any): void {
    const now = Date.now();

    if (data.e === '24hrTicker' || stream.includes('@ticker')) {
      const symbol = this.toNormalizedSymbol(data.s);
      const ticker: NormalizedTicker = {
        exchange: 'binance',
        symbol,
        bid: String(data.b ?? data.c ?? 0),
        ask: String(data.a ?? data.c ?? 0),
        last: String(data.c ?? 0),
        volume24h: String(data.v ?? 0),
        high24h: String(data.h ?? 0),
        low24h: String(data.l ?? 0),
        timestamp: data.E ?? now,
        receivedAt: now,
      };
      this.emitTicker(ticker);
    }

    if (data.e === 'trade' || stream.includes('@trade')) {
      const symbol = this.toNormalizedSymbol(data.s);
      const trade: NormalizedTrade = {
        exchange: 'binance',
        symbol,
        side: data.m ? 'sell' : 'buy', // m = buyer is maker → seller is taker
        price: String(data.p ?? 0),
        quantity: String(data.q ?? 0),
        timestamp: data.T ?? now,
        receivedAt: now,
        tradeId: String(data.t ?? ''),
      };
      this.emitTrade(trade);
    }
  }
}
