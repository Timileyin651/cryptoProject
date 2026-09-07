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
import { OpportunityRecord } from './OpportunityRecord';
import { OpportunitySnapshot } from './OpportunitySnapshot';
import { OpportunityLeg } from './OpportunityLeg';
import { ScannerPreference } from './ScannerPreference';
import { AnalyticsBucket } from './AnalyticsBucket';
import { FundingRateHistory } from './FundingRateHistory';
import { FavoriteCoin } from './FavoriteCoin';
import { FavoriteExchange } from './FavoriteExchange';
import { Watchlist } from './Watchlist';
import { WatchlistItem } from './WatchlistItem';
import { Alert } from './Alert';
import { Notification } from './Notification';
import { NotificationPreference } from './NotificationPreference';
import { PaymentTransaction } from './PaymentTransaction';
import { AuditLog } from './AuditLog';

// Initialize all models
Exchange.initModel(sequelize);
TradingPair.initModel(sequelize);
PriceSnapshot.initModel(sequelize);
ArbitrageOpportunity.initModel(sequelize);
User.initModel(sequelize);
RefreshToken.initModel(sequelize);
EmailVerification.initModel(sequelize);
PasswordReset.initModel(sequelize);
SubscriptionPlan.initModel(sequelize);
Subscription.initModel(sequelize);
FeatureEntitlement.initModel(sequelize);
SubscriptionEvent.initModel(sequelize);
Coin.initModel(sequelize);
Network.initModel(sequelize);
ExchangeCoin.initModel(sequelize);
ExchangeMarket.initModel(sequelize);
PairSymbolMapping.initModel(sequelize);
OpportunityRecord.initModel(sequelize);
OpportunitySnapshot.initModel(sequelize);
OpportunityLeg.initModel(sequelize);
ScannerPreference.initModel(sequelize);
AnalyticsBucket.initModel(sequelize);
FundingRateHistory.initModel(sequelize);
FavoriteCoin.initModel(sequelize);
FavoriteExchange.initModel(sequelize);
Watchlist.initModel(sequelize);
WatchlistItem.initModel(sequelize);
Alert.initModel(sequelize);
Notification.initModel(sequelize);
NotificationPreference.initModel(sequelize);
PaymentTransaction.initModel(sequelize);
AuditLog.initModel(sequelize);

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

// ── Opportunity Record associations ──
Exchange.hasMany(OpportunityRecord, { foreignKey: 'buy_exchange_id', as: 'buyOpportunityRecords' });
OpportunityRecord.belongsTo(Exchange, { foreignKey: 'buy_exchange_id', as: 'buyExchange' });

Exchange.hasMany(OpportunityRecord, { foreignKey: 'sell_exchange_id', as: 'sellOpportunityRecords' });
OpportunityRecord.belongsTo(Exchange, { foreignKey: 'sell_exchange_id', as: 'sellExchange' });

OpportunityRecord.hasMany(OpportunitySnapshot, { foreignKey: 'opportunity_id', as: 'snapshots' });
OpportunitySnapshot.belongsTo(OpportunityRecord, {
  foreignKey: 'opportunity_id',
  as: 'opportunity',
});

OpportunityRecord.hasMany(OpportunityLeg, { foreignKey: 'opportunity_id', as: 'legs' });
OpportunityLeg.belongsTo(OpportunityRecord, { foreignKey: 'opportunity_id', as: 'opportunity' });

Exchange.hasMany(OpportunityLeg, { foreignKey: 'exchange_id', as: 'opportunityLegs' });
OpportunityLeg.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });

// ── Scanner Preference associations ──
User.hasMany(ScannerPreference, { foreignKey: 'user_id', as: 'scannerPreferences' });
ScannerPreference.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Favorites & Watchlist associations ──
User.hasMany(FavoriteCoin, { foreignKey: 'user_id', as: 'favoriteCoins' });
FavoriteCoin.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(FavoriteExchange, { foreignKey: 'user_id', as: 'favoriteExchanges' });
FavoriteExchange.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
FavoriteExchange.belongsTo(Exchange, { foreignKey: 'exchange_id', as: 'exchange' });
Exchange.hasMany(FavoriteExchange, { foreignKey: 'exchange_id', as: 'favoriteExchanges' });

User.hasMany(Watchlist, { foreignKey: 'user_id', as: 'watchlists' });
Watchlist.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Watchlist.hasMany(WatchlistItem, { foreignKey: 'watchlist_id', as: 'items' });
WatchlistItem.belongsTo(Watchlist, { foreignKey: 'watchlist_id', as: 'watchlist' });

WatchlistItem.belongsTo(OpportunityRecord, { foreignKey: 'opportunity_id', as: 'opportunity' });
OpportunityRecord.hasMany(WatchlistItem, { foreignKey: 'opportunity_id', as: 'watchlistItems' });

// ── Alert & Notification associations ──
User.hasMany(Alert, { foreignKey: 'user_id', as: 'alerts' });
Alert.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Alert.hasMany(Notification, { foreignKey: 'alert_id', as: 'notifications' });
Notification.belongsTo(Alert, { foreignKey: 'alert_id', as: 'alert' });

User.hasOne(NotificationPreference, { foreignKey: 'user_id', as: 'notificationPreference' });
NotificationPreference.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Payment Transaction associations ──
User.hasMany(PaymentTransaction, { foreignKey: 'user_id', as: 'paymentTransactions' });
PaymentTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Subscription.hasMany(PaymentTransaction, { foreignKey: 'subscription_id', as: 'payments' });
PaymentTransaction.belongsTo(Subscription, { foreignKey: 'subscription_id', as: 'subscription' });

SubscriptionPlan.hasMany(PaymentTransaction, { foreignKey: 'plan_id', as: 'payments' });
PaymentTransaction.belongsTo(SubscriptionPlan, { foreignKey: 'plan_id', as: 'plan' });

User.hasMany(AuditLog, { foreignKey: 'actor_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

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
  OpportunityRecord,
  OpportunitySnapshot,
  OpportunityLeg,
  ScannerPreference,
  AnalyticsBucket,
  FundingRateHistory,
  FavoriteCoin,
  FavoriteExchange,
  Watchlist,
  WatchlistItem,
  Alert,
  Notification,
  NotificationPreference,
  PaymentTransaction,
  AuditLog,
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
export { OpportunityRecord } from './OpportunityRecord';
export { OpportunitySnapshot } from './OpportunitySnapshot';
export { OpportunityLeg } from './OpportunityLeg';
export { ScannerPreference } from './ScannerPreference';
export { AnalyticsBucket } from './AnalyticsBucket';
export { FundingRateHistory } from './FundingRateHistory';
export { FavoriteCoin } from './FavoriteCoin';
export { FavoriteExchange } from './FavoriteExchange';
export { Watchlist } from './Watchlist';
export { WatchlistItem } from './WatchlistItem';
export { Alert } from './Alert';
export { Notification } from './Notification';
export { NotificationPreference } from './NotificationPreference';
export { PaymentTransaction } from './PaymentTransaction';
export { AuditLog } from './AuditLog';

export { sequelize };
