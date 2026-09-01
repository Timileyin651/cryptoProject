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

export { sequelize };
