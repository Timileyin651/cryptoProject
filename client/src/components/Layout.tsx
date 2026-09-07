import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Ticker } from './Ticker';

export function Layout() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <div className="page-shell">
      <Ticker />
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="navbar-brand">
            <div className="logo-mark">AL</div>
            <span className="brand-text">Amber Ledger</span>
          </Link>

          <ul className="navbar-links">
            <li><NavLink to="/scanner">Scanner</NavLink></li>
            {isAuthenticated && <li><NavLink to="/favorites">Favorites</NavLink></li>}
            <li><NavLink to="/pricing">Pricing</NavLink></li>
            {isAuthenticated ? (
              <>
                <li><span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{user?.email}</span></li>
                <li>
                  <button className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }} onClick={logout}>
                    Logout
                  </button>
                </li>
              </>
            ) : (
              <>
                <li><NavLink to="/login">Login</NavLink></li>
                <li><NavLink to="/register" className="btn btn-accent" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>Sign Up</NavLink></li>
              </>
            )}
          </ul>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <p>Amber Ledger — Crypto Arbitrage Scanner. All data is estimates, not financial advice.</p>
      </footer>
    </div>
  );
}
