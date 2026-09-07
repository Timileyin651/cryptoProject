import WebSocket from 'ws';
import { WsStream } from '../WsStream';
import { NormalizedTicker, NormalizedTrade, NormalizedSymbol } from '../types';

const WS_URL = 'wss://stream.bybit.com/v5/public/spot';

/**
 * Translates Bybit's native WebSocket format into normalised events.
 *
 * Bybit v5 public spot WS:
 *   Topic: "tickers.BTCUSDT"
 *   Topic: "publicTrade.BTCUSDT"
 *
 * Subscribe message:
 *   { "op": "subscribe", "args": ["tickers.BTCUSDT", "publicTrade.BTCUSDT"] }
 */
export class BybitWsStream extends WsStream {
  constructor() {
    super({ exchange: 'bybit', url: WS_URL, heartbeatTimeoutMs: 20_000 });
  }

  private toExchangeSymbol(normalized: string): string {
    return normalized.replace('/', '');
  }

  private toNormalizedSymbol(exchangeSymbol: string): NormalizedSymbol {
    const quotes = ['USDT', 'USDC', 'BTC', 'ETH', 'DAI'];
    for (const q of quotes) {
      if (exchangeSymbol.endsWith(q) && exchangeSymbol.length > q.length) {
        return exchangeSymbol.slice(0, -q.length) + '/' + q;
      }
    }
    return exchangeSymbol.slice(0, -4) + '/' + exchangeSymbol.slice(-4);
  }

  protected buildSubscribeMessage(symbols: string[]): unknown {
    const args: string[] = [];
    for (const s of symbols) {
      const ex = this.toExchangeSymbol(s);
      args.push(`tickers.${ex}`);
      args.push(`publicTrade.${ex}`);
    }
    return { op: 'subscribe', args };
  }

  protected buildUnsubscribeMessage(symbols: string[]): unknown {
    const args: string[] = [];
    for (const s of symbols) {
      const ex = this.toExchangeSymbol(s);
      args.push(`tickers.${ex}`);
      args.push(`publicTrade.${ex}`);
    }
    return { op: 'unsubscribe', args };
  }

  protected parseMessage(data: WebSocket.Data): void {
    const raw = data.toString();
    const msg = JSON.parse(raw);

    // Skip subscription confirmations and pong
    if (msg.op === 'subscribe' || msg.op === 'pong' || msg.success !== undefined) return;

    // Ping response
    if (msg.op === 'ping') {
      // Bybit sends {"op":"ping"} — we should respond
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'pong' }));
      }
      return;
    }

    const now = Date.now();
    const topic: string = msg.topic ?? '';

    // Ticker
    if (topic.startsWith('tickers.') && msg.data) {
      const d = msg.data;
      const symbol = this.toNormalizedSymbol(d.symbol);
      const ticker: NormalizedTicker = {
        exchange: 'bybit',
        symbol,
        bid: String(d.bidPrice ?? d.lastPrice ?? 0),
        ask: String(d.askPrice ?? d.lastPrice ?? 0),
        last: String(d.lastPrice ?? 0),
        volume24h: String(d.volume24h ?? d.turnover24h ?? 0),
        high24h: String(d.highPrice24h ?? 0),
        low24h: String(d.lowPrice24h ?? 0),
        timestamp: d.ts ?? now,
        receivedAt: now,
      };
      this.emitTicker(ticker);
    }

    // Trade
    if (topic.startsWith('publicTrade.') && msg.data) {
      const trades = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const t of trades) {
        const symbol = this.toNormalizedSymbol(t.symbol);
        const trade: NormalizedTrade = {
          exchange: 'bybit',
          symbol,
          side: t.side === 'Buy' ? 'buy' : 'sell',
          price: String(t.price ?? 0),
          quantity: String(t.size ?? t.quantity ?? 0),
          timestamp: t.ts ?? now,
          receivedAt: now,
          tradeId: t.tradeId ?? t.execId ?? undefined,
        };
        this.emitTrade(trade);
      }
    }
  }
}
