import { Alert, AlertConditions } from '../models/Alert';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { logger } from '../utils/logger';

// ──────────────────── Evaluation result ────────────────────────────────

export interface AlertMatch {
  alert: Alert;
  opportunity: OpportunityRecord;
  /** Which conditions matched. */
  matchedConditions: string[];
  /** Summary for notification body. */
  summary: string;
}

// ──────────────────── AlertEvaluator ───────────────────────────────────

class AlertEvaluator {
  /**
   * Evaluate a single alert against a single opportunity.
   * Returns a match if ALL specified conditions are met.
   */
  evaluate(alert: Alert, opportunity: OpportunityRecord): AlertMatch | null {
    const conditions = alert.conditions as AlertConditions;
    const matched: string[] = [];

    // ── Opportunity type filter ──
    if (conditions.opportunityType && conditions.opportunityType !== 'any') {
      if (opportunity.opportunity_type !== conditions.opportunityType) return null;
      matched.push('opportunityType');
    }

    // ── Coin filter ──
    if (conditions.coin) {
      const coin = conditions.coin.toUpperCase();
      if (opportunity.base_currency.toUpperCase() !== coin) return null;
      matched.push('coin');
    }

    // ── Pair filter ──
    if (conditions.pair) {
      const pair = conditions.pair.toUpperCase();
      if (opportunity.symbol.toUpperCase() !== pair) return null;
      matched.push('pair');
    }

    // ── Buy exchange filter ──
    if (conditions.buyExchange) {
      if (opportunity.buy_exchange_slug.toLowerCase() !== conditions.buyExchange.toLowerCase()) {
        return null;
      }
      matched.push('buyExchange');
    }

    // ── Sell exchange filter ──
    if (conditions.sellExchange) {
      if (opportunity.sell_exchange_slug.toLowerCase() !== conditions.sellExchange.toLowerCase()) {
        return null;
      }
      matched.push('sellExchange');
    }

    // ── Min spread ──
    if (conditions.minSpread !== undefined) {
      const spread = parseFloat(opportunity.gross_spread_pct);
      if (isNaN(spread) || spread < conditions.minSpread) return null;
      matched.push('minSpread');
    }

    // ── Min net profit ──
    if (conditions.minNetProfit !== undefined) {
      const profit = parseFloat(opportunity.net_profit);
      if (isNaN(profit) || profit < conditions.minNetProfit) return null;
      matched.push('minNetProfit');
    }

    // ── Min ROI ──
    if (conditions.minRoi !== undefined) {
      const roi = parseFloat(opportunity.roi);
      if (isNaN(roi) || roi < conditions.minRoi) return null;
      matched.push('minRoi');
    }

    // ── Min volume (trade_size_base * buy_price as proxy) ──
    if (conditions.minVolume !== undefined) {
      const capital = parseFloat(opportunity.capital_required);
      if (isNaN(capital) || capital < conditions.minVolume) return null;
      matched.push('minVolume');
    }

    // ── Min liquidity ──
    if (conditions.minLiquidity !== undefined) {
      const buyDepth = parseFloat(opportunity.buy_depth);
      const sellDepth = parseFloat(opportunity.sell_depth);
      const minDepth = Math.min(isNaN(buyDepth) ? 0 : buyDepth, isNaN(sellDepth) ? 0 : sellDepth);
      if (minDepth < conditions.minLiquidity) return null;
      matched.push('minLiquidity');
    }

    // ── Withdrawal available ──
    if (conditions.requireWithdrawalAvailable) {
      if (!opportunity.withdrawal_available) return null;
      matched.push('requireWithdrawalAvailable');
    }

    // ── Deposit available ──
    if (conditions.requireDepositAvailable) {
      if (!opportunity.deposit_available) return null;
      matched.push('requireDepositAvailable');
    }

    // ── Network filter ──
    if (conditions.network) {
      if (
        !opportunity.network ||
        opportunity.network.toUpperCase() !== conditions.network.toUpperCase()
      ) {
        return null;
      }
      matched.push('network');
    }

    // ── Funding rate filter ──
    if (conditions.minFundingRate !== undefined && opportunity.current_funding_rate) {
      const rate = parseFloat(opportunity.current_funding_rate);
      if (isNaN(rate) || rate < conditions.minFundingRate) return null;
      matched.push('minFundingRate');
    }

    if (conditions.maxFundingRate !== undefined && opportunity.current_funding_rate) {
      const rate = parseFloat(opportunity.current_funding_rate);
      if (isNaN(rate) || rate > conditions.maxFundingRate) return null;
      matched.push('maxFundingRate');
    }

    // ── All conditions passed — build match ──
    const summary = this.buildSummary(alert, opportunity, matched);

    return {
      alert,
      opportunity,
      matchedConditions: matched,
      summary,
    };
  }

  /**
   * Evaluate a single alert against a batch of opportunities.
   * Returns all matches.
   */
  evaluateBatch(alert: Alert, opportunities: OpportunityRecord[]): AlertMatch[] {
    const matches: AlertMatch[] = [];
    for (const opp of opportunities) {
      const match = this.evaluate(alert, opp);
      if (match) matches.push(match);
    }
    return matches;
  }

  /**
   * Generate a dedup key for an alert + opportunity pair.
   * Used to prevent duplicate notifications.
   */
  dedupKey(alertId: number, opportunity: OpportunityRecord): string {
    return `${alertId}:${opportunity.symbol}:${opportunity.buy_exchange_slug}:${opportunity.sell_exchange_slug}`;
  }

  // ──────────────────── Summary builder ───────────────────────────────

  private buildSummary(alert: Alert, opportunity: OpportunityRecord, matched: string[]): string {
    const parts: string[] = [];

    parts.push(`Alert "${alert.name}" triggered`);
    parts.push(`for ${opportunity.symbol}`);

    const profit = parseFloat(opportunity.net_profit);
    const roi = parseFloat(opportunity.roi);
    const spread = parseFloat(opportunity.gross_spread_pct);

    if (!isNaN(profit)) {
      parts.push(
        `Net profit: ${profit > 0 ? '+' : ''}${profit.toFixed(2)} ${opportunity.quote_currency}`,
      );
    }
    if (!isNaN(roi)) {
      parts.push(`ROI: ${(roi * 100).toFixed(2)}%`);
    }
    if (!isNaN(spread)) {
      parts.push(`Spread: ${(spread * 100).toFixed(2)}%`);
    }

    parts.push(
      `Buy: ${opportunity.buy_exchange_slug} @ ${parseFloat(opportunity.buy_price).toFixed(2)}`,
    );
    parts.push(
      `Sell: ${opportunity.sell_exchange_slug} @ ${parseFloat(opportunity.sell_price).toFixed(2)}`,
    );

    if (opportunity.current_funding_rate) {
      const rate = parseFloat(opportunity.current_funding_rate);
      if (!isNaN(rate)) {
        parts.push(`Funding rate: ${(rate * 100).toFixed(4)}%`);
      }
    }

    return parts.join(' | ');
  }
}

export const alertEvaluator = new AlertEvaluator();
export { AlertEvaluator };
