import WebSocket from 'ws';
import { WsStream } from '../WsStream';
import { NormalizedTicker, NormalizedTrade, NormalizedSymbol } from '../types';

const WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';

/**
 * Translates OKX's native WebSocket format into normalised events.
 *
 * OKX v5 public WS:
 *   Channel: "tickers"  — arg: { "instId": "BTC-USDT" }
 *   Channel: "trades"   — arg: { "instId": "BTC-USDT" }
 *
 * Subscribe message:
 *   { "op": "subscribe", "args": [{"channel":"tickers","instId":"BTC-USDT"}] }
 *
 * Note: OKX uses "-" separator (BTC-USDT), not "/" or "".
 */
export class OkxWsStream extends WsStream {
  constructor() {
    super({ exchange: 'okx', url: WS_URL, heartbeatTimeoutMs: 30_000 });
  }

  private toExchangeSymbol(normalized: string): string {
    return normalized.replace('/', '-');
  }

  private toNormalizedSymbol(exchangeSymbol: string): NormalizedSymbol {
    return exchangeSymbol.replace('-', '/');
  }

  protected buildSubscribeMessage(symbols: string[]): unknown {
    const args: { channel: string; instId: string }[] = [];
    for (const s of symbols) {
      const instId = this.toExchangeSymbol(s);
      args.push({ channel: 'tickers', instId });
      args.push({ channel: 'trades', instId });
    }
    return { op: 'subscribe', args };
  }

  protected buildUnsubscribeMessage(symbols: string[]): unknown {
    const args: { channel: string; instId: string }[] = [];
    for (const s of symbols) {
      const instId = this.toExchangeSymbol(s);
      args.push({ channel: 'tickers', instId });
      args.push({ channel: 'trades', instId });
    }
    return { op: 'unsubscribe', args };
  }

  protected parseMessage(data: WebSocket.Data): void {
    const raw = data.toString();
    const msg = JSON.parse(raw);

    // Skip subscription confirmations, pong, and events
    if (msg.op === 'subscribe' || msg.op === 'pong' || msg.event !== undefined) return;

    // OKX sends pong in response to our ping — but also sends {"op":"ping"}
    // which we need to respond to
    if (msg.op === 'ping') {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'pong' }));
      }
      return;
    }

    const now = Date.now();
    const channel: string = msg.arg?.channel ?? '';

    // Ticker
    if (channel === 'tickers' && msg.data) {
      const d = msg.data[0] ?? msg.data;
      const symbol = this.toNormalizedSymbol(d.instId);
      const ticker: NormalizedTicker = {
        exchange: 'okx',
        symbol,
        bid: String(d.bidPx ?? d.last ?? 0),
        ask: String(d.askPx ?? d.last ?? 0),
        last: String(d.last ?? 0),
        volume24h: String(d.vol24h ?? d.volCcy24h ?? 0),
        high24h: String(d.high24h ?? 0),
        low24h: String(d.low24h ?? 0),
        timestamp: parseInt(d.ts ?? now, 10),
        receivedAt: now,
      };
      this.emitTicker(ticker);
    }

    // Trade
    if (channel === 'trades' && msg.data) {
      const trades = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const t of trades) {
        const symbol = this.toNormalizedSymbol(t.instId);
        const trade: NormalizedTrade = {
          exchange: 'okx',
          symbol,
          side: t.side === 'buy' ? 'buy' : 'sell',
          price: String(t.px ?? 0),
          quantity: String(t.sz ?? 0),
          timestamp: parseInt(t.ts ?? now, 10),
          receivedAt: now,
          tradeId: t.tradeId ?? undefined,
        };
        this.emitTrade(trade);
      }
    }
  }
}
