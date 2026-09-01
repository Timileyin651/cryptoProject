import { sequelize } from '../config/database';
import { Exchange } from './Exchange';
import { TradingPair } from './TradingPair';
import { PriceSnapshot } from './PriceSnapshot';
import { ArbitrageOpportunity } from './ArbitrageOpportunity';
import { User } from './User';
import { RefreshToken } from './RefreshToken';
import { EmailVerification } from './EmailVerification';
import { PasswordReset } from './PasswordReset';
import { SubscriptionPlan } from './SubscriptionPlan';
import { Subscription } from './Subscription';
import { FeatureEntitlement } from './FeatureEntitlement';
import { SubscriptionEvent } from './SubscriptionEvent';
import { Coin } from './Coin';
import { Network } from './Network';
import { ExchangeCoin } from './ExchangeCoin';
import { ExchangeMarket } from './ExchangeMarket';
import { PairSymbolMapping } from './PairSymbolMapping';

// Initialize all models
Exchange.initModel();
TradingPair.initModel();
PriceSnapshot.initModel();
ArbitrageOpportunity.initModel();
User.initModel();
RefreshToken.initModel();
EmailVerification.initModel();
PasswordReset.initModel();
SubscriptionPlan.initModel();
Subscription.initModel();
FeatureEntitlement.initModel();
SubscriptionEvent.initModel();
Coin.initModel();
Network.initModel();
ExchangeCoin.initModel();
ExchangeMarket.initModel();
PairSymbolMapping.initModel();

// ── Auth associations ──
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(EmailVerification, { foreignKey: 'user_id', as: 'emailVerifications' });
EmailVerification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PasswordReset, { foreignKey: 'user_id', as: 'passwordResets' });
PasswordReset.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Subscription associations ──
SubscriptionPlan.hasMany(Subscription, { foreignKey: 'plan_id', as: 'subscriptions' });
Subscription.belongsTo(SubscriptionPlan, { foreignKey: 'plan_id', as: 'plan' });

User.hasMany(Subscription, { foreignKey: 'user_id', as: 'subscriptions' });
Subscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

SubscriptionPlan.hasMany(FeatureEntitlement, { foreignKey: 'plan_id', as: 'entitlements' });
FeatureEntitlement.belongsTo(SubscriptionPlan, { foreignKey: 'plan_id', as: 'plan' });

User.hasMany(SubscriptionEvent, { foreignKey: 'user_id', as: 'subscriptionEvents' });
SubscriptionEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Subscription.hasMany(SubscriptionEvent, { foreignKey: 'subscription_id', as: 'events' });
SubscriptionEvent.belongsTo(Subscription, { foreignKey: 'subscription_id', as: 'subscription' });

// ── Exchange ↔ Market data associations ──
Exchange.hasMany(TradingPair, { foreignKey: 'exchange_id', as: 'tradingPairs' });
TradingPair.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });

TradingPair.hasMany(PriceSnapshot, { foreignKey: 'trading_pair_id', as: 'priceSnapshots' });
PriceSnapshot.belongsTo(TradingPair, { foreignKey: 'trading_pair_id', as: 'tradingPair' });

Exchange.hasMany(ArbitrageOpportunity, {
  foreignKey: 'buy_exchange_id',
  as: 'buyOpportunities',
});
ArbitrageOpportunity.belongsTo(Exchange, { foreignKey: 'buy_exchange_id', as: 'buyExchange' });

Exchange.hasMany(ArbitrageOpportunity, {
  foreignKey: 'sell_exchange_id',
  as: 'sellOpportunities',
});
ArbitrageOpportunity.belongsTo(Exchange, { foreignKey: 'sell_exchange_id', as: 'sellExchange' });

// ── Coin & Network associations ──
Network.belongsTo(Coin, { foreignKey: 'native_currency_id', as: 'nativeCurrency' });
Coin.hasMany(Network, { foreignKey: 'native_currency_id', as: 'networks' });

// ── ExchangeCoin: which coins each exchange supports ──
Exchange.hasMany(ExchangeCoin, { foreignKey: 'exchange_id', as: 'exchangeCoins' });
ExchangeCoin.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });

Coin.hasMany(ExchangeCoin, { foreignKey: 'coin_id', as: 'exchangeCoins' });
ExchangeCoin.belongsTo(Coin, { foreignKey: 'coin_id', as: 'coin' });

Network.hasMany(ExchangeCoin, { foreignKey: 'network_id', as: 'exchangeCoins' });
ExchangeCoin.belongsTo(Network, { foreignKey: 'network_id', as: 'network' });

// ── ExchangeMarket: per-exchange market details ──
TradingPair.hasMany(ExchangeMarket, { foreignKey: 'trading_pair_id', as: 'exchangeMarkets' });
ExchangeMarket.belongsTo(TradingPair, { foreignKey: 'trading_pair_id', as: 'tradingPair' });

Exchange.hasMany(ExchangeMarket, { foreignKey: 'exchange_id', as: 'markets' });
ExchangeMarket.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });

// ── PairSymbolMapping: symbol normalization ──
TradingPair.hasMany(PairSymbolMapping, { foreignKey: 'trading_pair_id', as: 'symbolMappings' });
PairSymbolMapping.belongsTo(TradingPair, { foreignKey: 'trading_pair_id', as: 'tradingPair' });

Exchange.hasMany(PairSymbolMapping, { foreignKey: 'exchange_id', as: 'symbolMappings' });
PairSymbolMapping.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });

Coin.hasMany(PairSymbolMapping, { foreignKey: 'base_coin_id', as: 'baseMappings' });
PairSymbolMapping.belongsTo(Coin, { foreignKey: 'base_coin_id', as: 'baseCoin' });

Coin.hasMany(PairSymbolMapping, { foreignKey: 'quote_coin_id', as: 'quoteMappings' });
PairSymbolMapping.belongsTo(Coin, { foreignKey: 'quote_coin_id', as: 'quoteCoin' });

export const models = {
  Exchange,
  TradingPair,
  PriceSnapshot,
  ArbitrageOpportunity,
  User,
  RefreshToken,
  EmailVerification,
  PasswordReset,
  SubscriptionPlan,
  Subscription,
  FeatureEntitlement,
  SubscriptionEvent,
  Coin,
  Network,
  ExchangeCoin,
  ExchangeMarket,
  PairSymbolMapping,
};

export { Exchange } from './Exchange';
export { TradingPair } from './TradingPair';
export { PriceSnapshot } from './PriceSnapshot';
export { ArbitrageOpportunity } from './ArbitrageOpportunity';
export { User } from './User';
export { RefreshToken } from './RefreshToken';
export { EmailVerification } from './EmailVerification';
export { PasswordReset } from './PasswordReset';
export { SubscriptionPlan } from './SubscriptionPlan';
export { Subscription } from './Subscription';
export { FeatureEntitlement } from './FeatureEntitlement';
export { SubscriptionEvent } from './SubscriptionEvent';
export { Coin } from './Coin';
export { Network } from './Network';
export { ExchangeCoin } from './ExchangeCoin';
export { ExchangeMarket } from './ExchangeMarket';
export { PairSymbolMapping } from './PairSymbolMapping';

export { sequelize };
