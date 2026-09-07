import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="brand-text">Amber Ledger</div>
          <p className="tagline">
            Real-time cross-exchange arbitrage scanning for crypto traders.
            Data-driven insights, not financial advice.
          </p>
        </div>

        <div className="footer-col">
          <h4>Product</h4>
          <ul>
            <li><Link to="/scanner">Scanner</Link></li>
            <li><Link to="/pricing">Pricing</Link></li>
            <li><Link to="/favorites">Favorites</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Account</h4>
          <ul>
            <li><Link to="/login">Sign In</Link></li>
            <li><Link to="/register">Create Account</Link></li>
            <li><Link to="/billing">Billing</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Legal</h4>
          <ul>
            <li><a href="#">Terms of Service</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Risk Disclaimer</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Amber Ledger. All rights reserved.</span>
        <span>All data is estimates, not financial advice.</span>
      </div>
    </footer>
  );
}
