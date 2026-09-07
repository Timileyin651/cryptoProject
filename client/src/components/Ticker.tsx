import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

interface TickerItem {
  symbol: string;
  price: string;
  change: number;
}

const PLACEHOLDER_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'BNB/USDT', 'AVAX/USDT',
];

export function Ticker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Use live opportunity data to populate ticker
    const handler = (opps: any[]) => {
      if (!opps || opps.length === 0) return;
      const merged = new Map<string, TickerItem>();
      for (const o of opps) {
        const sym = o.symbol;
        const avg = ((parseFloat(o.buy_price) + parseFloat(o.sell_price)) / 2);
        const change = parseFloat(o.net_roi_pct) * 100;
        merged.set(sym, {
          symbol: sym,
          price: avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          change,
        });
      }
      setItems(Array.from(merged.values()));
    };

    socket.on('opportunities', handler);

    // If socket is already connected, try fetching initial data
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off('opportunities', handler);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // Build the ticker content — duplicate items for seamless loop
  const tickerContent = connected && items.length > 0
    ? items
    : PLACEHOLDER_PAIRS.map((s) => ({ symbol: s, price: '—', change: 0 }));

  const isLive = connected && items.length > 0;

  return (
    <div className="ticker-strip">
      <div className="ticker-track">
        {/* First copy */}
        {tickerContent.map((item, i) => (
          <span key={`a-${i}`} className="ticker-item">
            <span className="ticker-symbol">{item.symbol}</span>
            {isLive ? (
              <>
                <span className="ticker-price">${item.price}</span>
                <span className={`ticker-change ${item.change >= 0 ? 'up' : 'down'}`}>
                  {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="ticker-connecting">
                <span className="dot" /> connecting…
              </span>
            )}
            <span className="ticker-sep">●</span>
          </span>
        ))}
        {/* Duplicate for seamless loop */}
        {tickerContent.map((item, i) => (
          <span key={`b-${i}`} className="ticker-item">
            <span className="ticker-symbol">{item.symbol}</span>
            {isLive ? (
              <>
                <span className="ticker-price">${item.price}</span>
                <span className={`ticker-change ${item.change >= 0 ? 'up' : 'down'}`}>
                  {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="ticker-connecting">
                <span className="dot" /> connecting…
              </span>
            )}
            <span className="ticker-sep">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}
