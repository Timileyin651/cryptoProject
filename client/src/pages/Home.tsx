import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Footer } from '../components/Footer';

/* ---- Types ---- */
interface Opportunity {
  id: number;
  symbol: string;
  opportunity_type: 'spot' | 'funding';
  status: string;
  buy_exchange: { name: string; slug: string };
  sell_exchange: { name: string; slug: string };
  buy_price: string;
  sell_price: string;
  gross_spread_pct: string;
  net_profit: string;
  net_roi_pct: string;
}

interface Plan {
  id: number;
  slug: string;
  name: string;
  price_monthly: string;
  description: string;
}

interface StatsData {
  exchanges?: number;
  pairs?: number;
  opportunities?: number;
}

/* ---- Feature definitions ---- */
const FEATURES = [
  {
    icon: '⚡',
    title: 'Real-Time Scanning',
    desc: 'Live cross-exchange price feeds update every few seconds. Spots open arbitrage windows the moment they appear.',
  },
  {
    icon: '🛡️',
    title: 'Net Profit Calculation',
    desc: 'Fees, slippage, and transfer costs are factored in automatically so you see only actionable spreads.',
  },
  {
    icon: '📊',
    title: 'Multi-Exchange View',
    desc: 'Compare prices across all supported exchanges in one unified table — no tab-switching required.',
  },
];

/* ============================================ */
export function Home() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stats, setStats] = useState<StatsData>({});
  const [flashingRows, setFlashingRows] = useState<Set<number>>(new Set());
  const prevIds = useRef(new Set<number>());

  /* ---- Fetch initial data ---- */
  useEffect(() => {
    api.get<{ data: Opportunity[] }>('/api/v1/arbitrage/opportunities?page=1&limit=6')
      .then((r) => setOpps(r.data))
      .catch(() => {});

    api.get<{ data: Plan[] }>('/api/v1/billing/plans')
      .then((r) => setPlans(r.data))
      .catch(() => {});

    // Stats from health endpoint
    api.get<any>('/api/v1/health/detailed')
      .then((r) => {
        const d = r.data || r;
        setStats({
          exchanges: d.exchanges?.length ?? d.adapters?.length,
          pairs: d.pairs ?? d.tradingPairs,
          opportunities: d.opportunities,
        });
      })
      .catch(() => {});
  }, []);

  /* ---- Live socket updates ---- */
  useEffect(() => {
    const socket = getSocket();

    const handler = (data: Opportunity[]) => {
      if (!data || data.length === 0) return;
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
    };

    socket.on('opportunities', handler);
    return () => { socket.off('opportunities', handler); };
  }, []);

  function getFlashClass(id: number) {
    if (!flashingRows.has(id) || opps.length === 0) return '';
    const opp = opps.find((o) => o.id === id);
    if (!opp) return '';
    return parseFloat(opp.net_profit) >= 0 ? 'flash-buy' : 'flash-sell';
  }

  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-inner">
          <div className="hero-content">
            <h1 className="hero-headline">
              Find edges the<br />
              market <span className="accent">misses</span>
            </h1>
            <p className="hero-sub">
              Amber Ledger scans dozens of exchanges in real time,
              surfaces net-profitable arbitrage spreads, and shows you
              exactly where the opportunity lives — before it disappears.
            </p>
            <div className="hero-ctas">
              <Link to="/register" className="btn btn-accent">
                Start Scanning Free
              </Link>
              <a href="#demo" className="btn-ghost">
                See Live Demo ↓
              </a>
            </div>
          </div>

          <div className="hero-mockup" id="demo">
            <div className="mockup-tilt">
              <div className="mockup-chrome">
                <div className="mockup-bar">
                  <div className="mockup-dots">
                    <div className="mockup-dot" />
                    <div className="mockup-dot" />
                    <div className="mockup-dot" />
                  </div>
                  <div className="mockup-url">app.amberledger.com/scanner</div>
                </div>
                <div className="mockup-body">
                  {opps.length > 0 ? (
                    <table className="opps-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Symbol</th>
                          <th>Buy</th>
                          <th>Sell</th>
                          <th>Spread</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opps.slice(0, 5).map((o) => (
                          <tr key={o.id} className={getFlashClass(o.id)}>
                            <td>
                              <span className={`pill ${o.opportunity_type === 'spot' ? 'pill-accent' : 'pill-warning'}`}>
                                {o.opportunity_type}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{o.symbol}</td>
                            <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem' }}>{o.buy_exchange?.name}</td>
                            <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem' }}>{o.sell_exchange?.name}</td>
                            <td>{(parseFloat(o.gross_spread_pct) * 100).toFixed(3)}%</td>
                            <td style={{ color: parseFloat(o.net_profit) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                              {parseFloat(o.net_profit) >= 0 ? '+' : ''}{o.net_profit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="skeleton" style={{ height: '40px', width: '100%' }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="stats-bar">
        <div className="stats-inner">
          {stats.exchanges != null && (
            <div className="stat">
              <div className="stat-value">{stats.exchanges}</div>
              <div className="stat-label">Exchanges Connected</div>
            </div>
          )}
          {stats.pairs != null && (
            <div className="stat">
              <div className="stat-value">{stats.pairs.toLocaleString()}</div>
              <div className="stat-label">Pairs Tracked</div>
            </div>
          )}
          {stats.opportunities != null && (
            <div className="stat">
              <div className="stat-value">{stats.opportunities.toLocaleString()}</div>
              <div className="stat-label">Opportunities Found</div>
            </div>
          )}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features">
        <div className="features-heading">
          <h2>Built for speed and clarity</h2>
          <p>Everything you need to act on arbitrage — nothing you don't.</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      {plans.length > 0 && (
        <section className="pricing-teaser">
          <div className="pricing-teaser-heading">
            <h2>Simple, transparent pricing</h2>
            <p>Start free. Upgrade when you're ready.</p>
          </div>
          <div className="pricing-teaser-grid">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`pricing-teaser-card${plan.slug === 'premium' ? ' popular' : ''}`}
              >
                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">
                  {parseFloat(plan.price_monthly) === 0 ? 'Free' : `₦${plan.price_monthly}`}
                  {parseFloat(plan.price_monthly) > 0 && <span className="period">/mo</span>}
                </div>
                <Link
                  to="/pricing"
                  className={`btn ${plan.slug === 'premium' ? 'btn-accent' : 'btn-secondary'} btn-full`}
                >
                  {plan.slug === 'free' ? 'Get Started' : plan.slug === 'premium' ? 'Go Premium' : 'Contact Us'}
                </Link>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link to="/pricing" className="btn btn-secondary">
              Compare all features →
            </Link>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <Footer />
    </>
  );
}
