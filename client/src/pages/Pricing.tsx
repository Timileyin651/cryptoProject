import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Plan {
  id: number;
  slug: string;
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  currency: string;
}

export function Pricing() {
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get<{ data: Plan[] }>('/api/v1/billing/plans').then((res) => setPlans(res.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-heading" style={{ textAlign: 'center' }}>
        <h1>Plans & Pricing</h1>
        <p>Choose the plan that fits your trading needs</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>
        {plans.map((plan) => (
          <div key={plan.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              {plan.name}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>{plan.description}</p>
            <div style={{ marginBottom: '1.5rem' }}>
              <span className="numeric" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {parseFloat(plan.price_monthly) === 0 ? 'Free' : `₦${plan.price_monthly}`}
              </span>
              {parseFloat(plan.price_monthly) > 0 && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>/month</span>
              )}
            </div>
            <div style={{ marginTop: 'auto' }}>
              {isAuthenticated ? (
                <Link to="/billing" className="btn btn-accent btn-full">
                  {plan.slug === 'free' ? 'Current Plan' : 'Upgrade'}
                </Link>
              ) : (
                <Link to="/register" className="btn btn-accent btn-full">
                  Get Started
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
