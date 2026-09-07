import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

interface Opportunity {
  id: number;
  symbol: string;
  base_currency: string;
  quote_currency: string;
  opportunity_type: 'spot' | 'funding';
  status: string;
  status_reason: string | null;
  buy_exchange: { name: string; slug: string };
  sell_exchange: { name: string; slug: string };
  buy_price: string;
  sell_price: string;
  gross_spread_pct: string;
  net_profit: string;
  net_roi_pct: string;
  calculated_at: string;
}

interface OpportunityResponse {
  data: Opportunity[];
  pagination: { page: number; totalPages: number; total: number; hasNext: boolean; hasPrev: boolean };
}

type ExchangeHealth = Record<string, 'ok' | 'stale' | 'disconnected'>;

export function Scanner() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [exchangeHealth, setExchangeHealth] = useState<ExchangeHealth>({});
  const [flashingRows, setFlashingRows] = useState<Set<number>>(new Set());
  const prevIds = useRef(new Set<number>());

  // Fetch opportunities
  const fetchOpps = useCallback(async () => {
    try {
      const res = await api.get<OpportunityResponse>(`/api/v1/arbitrage/opportunities?page=${page}&limit=50`);
      setOpps(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch {
      // silently fail — table shows last known data
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchOpps();
  }, [fetchOpps]);

  // Socket.IO live updates
  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));

    socket.on('opportunities', (data: Opportunity[]) => {
      if (!data || data.length === 0) return;

      // Detect changed rows for flash animation
      const newIds = new Set(data.map((o) => o.id));
      const changed = new Set<number>();
      for (const id of newIds) {
        if (!prevIds.current.has(id)) changed.add(id);
      }
      prevIds.current = newIds;

      if (changed.size > 0) {
        setFlashingRows(changed);
        setTimeout(() => setFlashingRows(new Set()), 1200);
      }

      setOpps((prev) => {
        const map = new Map(prev.map((o) => [o.id, o]));
        for (const o of data) map.set(o.id, o);
        return Array.from(map.values());
      });
    });

    socket.on('exchangeHealth', (health: ExchangeHealth) => {
      setExchangeHealth(health);
    });

    return () => {
      socket.off('opportunities');
      socket.off('exchangeHealth');
    };
  }, []);

  function getFlashClass(id: number) {
    if (!flashingRows.has(id) || opps.length === 0) return '';
    const opp = opps.find((o) => o.id === id);
    if (!opp) return '';
    const profit = parseFloat(opp.net_profit);
    return profit >= 0 ? 'flash-buy' : 'flash-sell';
  }

  return (
    <div>
      <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Scanner</h1>
          <p>Live cross-exchange arbitrage opportunities</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Exchange health indicators */}
          {Object.entries(exchangeHealth).map(([slug, status]) => (
            <div key={slug} className="live-badge" title={`${slug}: ${status}`}>
              <div className={`live-dot ${status === 'ok' ? '' : status}`} />
              <span className="numeric" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{slug}</span>
            </div>
          ))}
          {/* Socket status */}
          <div className="live-badge">
            <div className={`live-dot ${socketStatus === 'connected' ? '' : 'disconnected'}`} />
            <span style={{ color: socketStatus === 'connected' ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
              {socketStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '48px', width: '100%' }} />
          ))}
        </div>
      ) : opps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No opportunities found. The scanner may still be starting up.</p>
        </div>
      ) : (
        <div className="table-wrap card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="opps-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Symbol</th>
                <th>Buy Exchange</th>
                <th>Sell Exchange</th>
                <th>Buy Price</th>
                <th>Sell Price</th>
                <th>Spread</th>
                <th>Net Profit</th>
                <th>ROI</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {opps.map((opp) => (
                <tr key={opp.id} className={getFlashClass(opp.id)}>
                  <td>
                    <span className={`pill ${opp.opportunity_type === 'spot' ? 'pill-accent' : 'pill-warning'}`}>
                      {opp.opportunity_type}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{opp.symbol}</td>
                  <td style={{ fontFamily: 'var(--font-body)' }}>{opp.buy_exchange?.name}</td>
                  <td style={{ fontFamily: 'var(--font-body)' }}>{opp.sell_exchange?.name}</td>
                  <td>{opp.buy_price}</td>
                  <td>{opp.sell_price}</td>
                  <td>{(parseFloat(opp.gross_spread_pct) * 100).toFixed(3)}%</td>
                  <td style={{ color: parseFloat(opp.net_profit) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                    {parseFloat(opp.net_profit) >= 0 ? '+' : ''}{opp.net_profit}
                  </td>
                  <td style={{ color: parseFloat(opp.net_roi_pct) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                    {(parseFloat(opp.net_roi_pct) * 100).toFixed(3)}%
                  </td>
                  <td>
                    <span className={`pill ${opp.status === 'active' ? 'pill-buy' : opp.status === 'marginal' ? 'pill-warning' : 'pill-neutral'}`}>
                      {opp.status}
                    </span>
                  </td>
                  <td>
                    <Link to={`/scanner/${opp.id}`} className="btn btn-tertiary" style={{ fontSize: '0.75rem' }}>
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span className="numeric" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
