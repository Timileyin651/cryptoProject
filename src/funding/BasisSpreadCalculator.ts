import { v4 as uuidv4 } from 'uuid';
import {
  BasisSpreadResult,
  SpotPerpPair,
  FundingRateEntry,
  FundingOpportunityStatus,
  PositionSide,
} from './types';
import { FeeCalculator } from '../arbitrage/FeeCalculator';
import { TickerSnapshot } from '../exchanges/ExchangeAdapter';
import { logger } from '../utils/logger';

// ──────────────────── Defaults ──────────────────────────────────────────

const DEFAULT_FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// ──────────────────── BasisSpreadCalculator ─────────────────────────────

/**
 * Calculates the basis spread between spot and perpetual futures,
 * estimates expected funding income/cost, and produces a net return
 * estimate for a cash-and-carry (or reverse) trade.
 *
 * IMPORTANT: All outputs are ESTIMATES. Funding rates change every
 * settlement interval and basis can move against the position.
 */
export class BasisSpreadCalculator {
  private feeCalculator: FeeCalculator;
  private defaultLeverage: number;

  constructor(feeCalculator: FeeCalculator, defaultLeverage = 1) {
    this.feeCalculator = feeCalculator;
    this.defaultLeverage = defaultLeverage;
  }

  // ──────────────────── Public API ──────────────────────────────────────

  /**
   * Calculate the full basis spread result for one spot/perp pair
   * on one exchange.
   *
   * @param pair - The spot/perp pair.
   * @param spotTicker - Current spot ticker (from adapter).
   * @param perpTicker - Current perp ticker (from adapter).
   * @param fundingRate - Current funding rate entry.
   * @param tradeSizeBase - Trade size in base currency.
   * @param holdingHorizonHours - How long to hold the position (hours).
   */
  calculate(
    pair: SpotPerpPair,
    spotTicker: TickerSnapshot,
    perpTicker: TickerSnapshot,
    fundingRate: FundingRateEntry,
    tradeSizeBase: number,
    holdingHorizonHours: number,
  ): BasisSpreadResult {
    const now = Date.now();
    const spotPrice = parseFloat(spotTicker.last);
    const perpPrice = parseFloat(perpTicker.last);
    const currentFundingRate = fundingRate.fundingRate;
    const fundingIntervalMs = fundingRate.fundingIntervalMs ?? DEFAULT_FUNDING_INTERVAL_MS;

    // ── Basis calculation ─────────────────────────────────────────
    const basis = perpPrice - spotPrice;
    const basisPct = spotPrice > 0 ? basis / spotPrice : 0;

    // ── Annualized funding rate ───────────────────────────────────
    // funding rate is per-interval; annualize based on actual interval
    const intervalsPerYear = MS_PER_YEAR / fundingIntervalMs;
    const fundingRateApr = currentFundingRate * intervalsPerYear;

    // ── Determine position side ───────────────────────────────────
    const positionSide = this.determinePositionSide(currentFundingRate);

    // ── Expected funding income/cost ──────────────────────────────
    const holdingHorizonMs = holdingHorizonHours * 60 * 60 * 1000;
    const intervalsInHorizon = holdingHorizonMs / fundingIntervalMs;
    const notionalValue = spotPrice * tradeSizeBase;

    // For long_spot_short_perp: you RECEIVE funding when rate > 0
    // For short_spot_long_perp: you RECEIVE funding when rate < 0
    const effectiveFundingRate =
      positionSide === 'long_spot_short_perp' ? currentFundingRate : -currentFundingRate;

    const expectedFundingPerInterval = notionalValue * effectiveFundingRate;
    const totalExpectedFunding = expectedFundingPerInterval * intervalsInHorizon;

    // ── Basis convergence estimate ────────────────────────────────
    // Simple heuristic: assume basis converges linearly toward zero
    // over the holding horizon. This is a rough estimate — basis can
    // widen or fluctuate unpredictably.
    //
    // For long_spot_short_perp (short perp): you profit when basis narrows.
    // For short_spot_long_perp (long perp): you profit when basis widens
    //   (or rather, the discount narrows).
    const basisConvergenceEstimate =
      positionSide === 'long_spot_short_perp'
        ? basis * tradeSizeBase * Math.min(intervalsInHorizon / 24, 1) // partial convergence
        : -basis * tradeSizeBase * Math.min(intervalsInHorizon / 24, 1);

    // ── Total estimated return ────────────────────────────────────
    const totalEstimatedReturn = totalExpectedFunding + basisConvergenceEstimate;
    const estimatedReturnPct = notionalValue > 0 ? totalEstimatedReturn / notionalValue : 0;

    // ── Trading fees (reuse FeeCalculator from spot/futures arb) ──
    // Entry: buy spot + sell perp (or inverse)
    const entryFees = this.calculateEntryFees(
      pair.exchange,
      pair.spotSymbol,
      pair.perpSymbol,
      spotPrice,
      perpPrice,
      tradeSizeBase,
    );
    // Exit: sell spot + buy perp (or inverse) — same fees
    const exitFees = entryFees;
    const totalFees = entryFees + exitFees;

    // ── Net return after fees ─────────────────────────────────────
    const netReturnEstimate = totalEstimatedReturn - totalFees;
    const netReturnPct = notionalValue > 0 ? netReturnEstimate / notionalValue : 0;

    // ── Status ────────────────────────────────────────────────────
    const { status, statusReason } = this.determineStatus(
      netReturnEstimate,
      netReturnPct,
      currentFundingRate,
      fundingRate,
    );

    return {
      id: uuidv4(),
      exchange: pair.exchange,
      baseCurrency: pair.baseCurrency,
      quoteCurrency: pair.quoteCurrency,
      spotSymbol: pair.spotSymbol,
      perpSymbol: pair.perpSymbol,

      spotPrice,
      perpPrice,

      basis,
      basisPct,

      currentFundingRate,
      fundingRateApr,
      fundingIntervalMs,
      nextFundingTime: fundingRate.nextFundingTime,

      expectedFundingPerInterval,
      intervalsInHorizon,
      totalExpectedFunding,

      basisConvergenceEstimate,

      totalEstimatedReturn,
      estimatedReturnPct,
      entryFees,
      exitFees,
      totalFees,
      netReturnEstimate,
      netReturnPct,

      positionSide,
      leverage: this.defaultLeverage,
      tradeSizeBase,
      notionalValue,

      calculatedAt: now,
      status,
      statusReason,
      isEstimate: true, // All funding rate values are estimates
    };
  }

  /**
   * Calculate basis spread results for multiple pairs.
   */
  calculateAll(
    pairs: SpotPerpPair[],
    spotTickers: Map<string, TickerSnapshot>,
    perpTickers: Map<string, TickerSnapshot>,
    fundingRates: Map<string, FundingRateEntry>,
    tradeSizeBase: number,
    holdingHorizonHours: number,
  ): BasisSpreadResult[] {
    const results: BasisSpreadResult[] = [];

    for (const pair of pairs) {
      const spotKey = `${pair.exchange}:${pair.spotSymbol}`;
      const perpKey = `${pair.exchange}:${pair.perpSymbol}`;
      const rateKey = `${pair.exchange}:${pair.perpSymbol}`;

      const spotTicker = spotTickers.get(spotKey);
      const perpTicker = perpTickers.get(perpKey);
      const fundingRate = fundingRates.get(rateKey);

      if (!spotTicker || !perpTicker || !fundingRate) {
        logger.debug(`[BasisSpreadCalculator] Missing data for ${spotKey} — skipping`);
        continue;
      }

      try {
        const result = this.calculate(
          pair,
          spotTicker,
          perpTicker,
          fundingRate,
          tradeSizeBase,
          holdingHorizonHours,
        );
        results.push(result);
      } catch (error) {
        logger.error(
          `[BasisSpreadCalculator] Error calculating ${pair.exchange}:${pair.perpSymbol}:`,
          error,
        );
      }
    }

    return results;
  }

  /**
   * Determine the position side based on the current funding rate.
   */
  private determinePositionSide(fundingRate: number): PositionSide {
    // When funding rate is positive, perp holders pay spot holders.
    // Profitable to be long spot + short perp.
    // When funding rate is negative, spot holders pay perp holders.
    // Profitable to be short spot + long perp.
    return fundingRate >= 0 ? 'long_spot_short_perp' : 'short_spot_long_perp';
  }

  /**
   * Calculate entry fees for both legs using the FeeCalculator.
   */
  private calculateEntryFees(
    exchange: string,
    spotSymbol: string,
    perpSymbol: string,
    spotPrice: number,
    perpPrice: number,
    tradeSizeBase: number,
  ): number {
    // Spot leg fee
    const spotNotional = spotPrice * tradeSizeBase;
    const spotFee = this.feeCalculator.calculateTradingFee(exchange, spotSymbol, spotNotional);

    // Perp leg fee — use taker fee (conservative)
    const perpNotional = perpPrice * tradeSizeBase;
    const perpFee = this.feeCalculator.calculateTradingFee(exchange, perpSymbol, perpNotional);

    return spotFee + perpFee;
  }

  /**
   * Determine the opportunity status.
   */
  private determineStatus(
    netReturnEstimate: number,
    netReturnPct: number,
    currentFundingRate: number,
    fundingRate: FundingRateEntry,
  ): { status: FundingOpportunityStatus; statusReason?: string } {
    // Check data freshness
    const dataAgeMs = Date.now() - fundingRate.fetchedAt;
    if (dataAgeMs > 300_000) {
      // 5 min
      return {
        status: 'expired',
        statusReason: `Funding rate data is ${(dataAgeMs / 1000).toFixed(0)}s old`,
      };
    }

    // Check if funding rate is too low
    if (Math.abs(currentFundingRate) < 0.00001) {
      // < 0.001%
      return {
        status: 'low_funding',
        statusReason: `Funding rate ${(currentFundingRate * 100).toFixed(4)}% is negligible`,
      };
    }

    // Check profitability
    if (netReturnEstimate <= 0) {
      return {
        status: 'unprofitable',
        statusReason: `Net return estimate ${netReturnEstimate.toFixed(4)} is negative after fees`,
      };
    }

    // Marginal: very thin margin
    if (netReturnPct < 0.0001) {
      // < 0.01%
      return {
        status: 'marginal',
        statusReason: `Net return ${(netReturnPct * 100).toFixed(4)}% is marginal`,
      };
    }

    return {
      status: 'active',
      statusReason: `Estimated net return: ${(netReturnPct * 100).toFixed(4)}%`,
    };
  }
}
