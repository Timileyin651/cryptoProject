import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Scanner } from './pages/Scanner';
import { Pricing } from './pages/Pricing';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route element={<Layout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/scanner/:id" element={<Scanner />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/favorites" element={<div className="card"><p style={{ color: 'var(--text-secondary)' }}>Favorites — coming soon</p></div>} />
              <Route path="/billing" element={<div className="card"><p style={{ color: 'var(--text-secondary)' }}>Billing — coming soon</p></div>} />
              <Route path="*" element={<div className="card"><p style={{ color: 'var(--text-secondary)' }}>Page not found</p></div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
