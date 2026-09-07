import { AlertEvaluator } from '../../src/services/AlertEvaluator';

// Mock models
jest.mock('../../src/models/Alert', () => ({ Alert: {} }));
jest.mock('../../src/models/OpportunityRecord', () => ({ OpportunityRecord: {} }));

describe('AlertEvaluator', () => {
  let evaluator: AlertEvaluator;

  beforeEach(() => {
    evaluator = new AlertEvaluator();
  });

  function makeOpp(overrides: Record<string, any> = {}) {
    return {
      id: 1,
      opportunity_type: 'spot',
      symbol: 'BTC/USDT',
      base_currency: 'BTC',
      quote_currency: 'USDT',
      buy_exchange_slug: 'binance',
      sell_exchange_slug: 'okx',
      buy_price: '50000',
      sell_price: '50500',
      gross_spread_pct: '0.01',
      net_profit: '50',
      roi: '0.005',
      capital_required: '10000',
      buy_depth: '100',
      sell_depth: '100',
      liquidity_executable: true,
      withdrawal_available: true,
      deposit_available: true,
      network: 'TRC20',
      current_funding_rate: null,
      ...overrides,
    };
  }

  function makeAlert(conditions: Record<string, any> = {}) {
    return {
      id: 1,
      user_id: 1,
      name: 'Test Alert',
      conditions,
      channels: ['email'],
      cooldown_seconds: 3600,
      last_notified_at: null,
    } as any;
  }

  describe('evaluate', () => {
    it('matches when no conditions specified (catch-all)', () => {
      const result = evaluator.evaluate(makeAlert({}), makeOpp() as any);
      expect(result).not.toBeNull();
      expect(result!.matchedConditions).toHaveLength(0);
    });

    it('matches coin filter', () => {
      const result = evaluator.evaluate(makeAlert({ coin: 'BTC' }), makeOpp() as any);
      expect(result).not.toBeNull();
      expect(result!.matchedConditions).toContain('coin');
    });

    it('rejects wrong coin', () => {
      const result = evaluator.evaluate(makeAlert({ coin: 'ETH' }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches pair filter', () => {
      const result = evaluator.evaluate(makeAlert({ pair: 'BTC/USDT' }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects wrong pair', () => {
      const result = evaluator.evaluate(makeAlert({ pair: 'ETH/USDT' }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches minSpread', () => {
      const result = evaluator.evaluate(makeAlert({ minSpread: 0.005 }), makeOpp() as any);
      expect(result).not.toBeNull();
      expect(result!.matchedConditions).toContain('minSpread');
    });

    it('rejects when spread below threshold', () => {
      const result = evaluator.evaluate(makeAlert({ minSpread: 0.05 }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches minNetProfit', () => {
      const result = evaluator.evaluate(makeAlert({ minNetProfit: 10 }), makeOpp() as any);
      expect(result).not.toBeNull();
      expect(result!.matchedConditions).toContain('minNetProfit');
    });

    it('rejects when profit below threshold', () => {
      const result = evaluator.evaluate(makeAlert({ minNetProfit: 100 }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches minRoi', () => {
      const result = evaluator.evaluate(makeAlert({ minRoi: 0.001 }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('matches buyExchange filter', () => {
      const result = evaluator.evaluate(makeAlert({ buyExchange: 'binance' }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects wrong buyExchange', () => {
      const result = evaluator.evaluate(makeAlert({ buyExchange: 'okx' }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches sellExchange filter', () => {
      const result = evaluator.evaluate(makeAlert({ sellExchange: 'okx' }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('matches minLiquidity', () => {
      const result = evaluator.evaluate(makeAlert({ minLiquidity: 50 }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects when liquidity below threshold', () => {
      const result = evaluator.evaluate(makeAlert({ minLiquidity: 200 }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches withdrawalAvailable', () => {
      const result = evaluator.evaluate(
        makeAlert({ requireWithdrawalAvailable: true }),
        makeOpp() as any,
      );
      expect(result).not.toBeNull();
    });

    it('rejects when withdrawal unavailable', () => {
      const result = evaluator.evaluate(
        makeAlert({ requireWithdrawalAvailable: true }),
        makeOpp({ withdrawal_available: false }) as any,
      );
      expect(result).toBeNull();
    });

    it('matches network filter', () => {
      const result = evaluator.evaluate(makeAlert({ network: 'TRC20' }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects wrong network', () => {
      const result = evaluator.evaluate(makeAlert({ network: 'ERC20' }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('matches opportunityType filter', () => {
      const result = evaluator.evaluate(makeAlert({ opportunityType: 'spot' }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects wrong opportunityType', () => {
      const result = evaluator.evaluate(
        makeAlert({ opportunityType: 'funding' }),
        makeOpp() as any,
      );
      expect(result).toBeNull();
    });

    it('matches minFundingRate', () => {
      const result = evaluator.evaluate(
        makeAlert({ minFundingRate: 0.0001 }),
        makeOpp({ current_funding_rate: '0.0005' }) as any,
      );
      expect(result).not.toBeNull();
    });

    it('rejects when funding rate below threshold', () => {
      const result = evaluator.evaluate(
        makeAlert({ minFundingRate: 0.001 }),
        makeOpp({ current_funding_rate: '0.0001' }) as any,
      );
      expect(result).toBeNull();
    });

    it('matches minVolume', () => {
      const result = evaluator.evaluate(makeAlert({ minVolume: 5000 }), makeOpp() as any);
      expect(result).not.toBeNull();
    });

    it('rejects when volume below threshold', () => {
      const result = evaluator.evaluate(makeAlert({ minVolume: 50000 }), makeOpp() as any);
      expect(result).toBeNull();
    });

    it('builds summary with matched conditions', () => {
      const result = evaluator.evaluate(
        makeAlert({ coin: 'BTC', minSpread: 0.005 }),
        makeOpp() as any,
      );
      expect(result).not.toBeNull();
      expect(result!.summary).toContain('BTC/USDT');
      expect(result!.summary).toContain('binance');
      expect(result!.summary).toContain('okx');
    });
  });

  describe('evaluateBatch', () => {
    it('returns all matching opportunities', () => {
      const opps = [
        makeOpp({ id: 1, symbol: 'BTC/USDT' }),
        makeOpp({ id: 2, symbol: 'ETH/USDT', base_currency: 'ETH' }),
        makeOpp({ id: 3, symbol: 'SOL/USDT', base_currency: 'SOL' }),
      ];
      const matches = evaluator.evaluateBatch(makeAlert({ coin: 'BTC' }), opps as any);
      expect(matches).toHaveLength(1);
      expect(matches[0].opportunity.symbol).toBe('BTC/USDT');
    });

    it('returns empty when no matches', () => {
      const opps = [makeOpp({ base_currency: 'ETH' })];
      const matches = evaluator.evaluateBatch(makeAlert({ coin: 'BTC' }), opps as any);
      expect(matches).toHaveLength(0);
    });
  });

  describe('dedupKey', () => {
    it('generates a unique dedup key', () => {
      const opp = makeOpp();
      const key = evaluator.dedupKey(1, opp as any);
      expect(key).toBe('1:BTC/USDT:binance:okx');
    });
  });
});
