import { sequelize } from '../config/database';
import { Exchange } from './Exchange';
import { TradingPair } from './TradingPair';
import { PriceSnapshot } from './PriceSnapshot';
import { ArbitrageOpportunity } from './ArbitrageOpportunity';
import { User } from './User';
import { RefreshToken } from './RefreshToken';
import { EmailVerification } from './EmailVerification';
import { PasswordReset } from './PasswordReset';

// Initialize all models
Exchange.initModel();
TradingPair.initModel();
PriceSnapshot.initModel();
ArbitrageOpportunity.initModel();
User.initModel();
RefreshToken.initModel();
EmailVerification.initModel();
PasswordReset.initModel();

// Associations
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(EmailVerification, { foreignKey: 'user_id', as: 'emailVerifications' });
EmailVerification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PasswordReset, { foreignKey: 'user_id', as: 'passwordResets' });
PasswordReset.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export const models = {
  Exchange,
  TradingPair,
  PriceSnapshot,
  ArbitrageOpportunity,
  User,
  RefreshToken,
  EmailVerification,
  PasswordReset,
};

export { Exchange } from './Exchange';
export { TradingPair } from './TradingPair';
export { PriceSnapshot } from './PriceSnapshot';
export { ArbitrageOpportunity } from './ArbitrageOpportunity';
export { User } from './User';
export { RefreshToken } from './RefreshToken';
export { EmailVerification } from './EmailVerification';
export { PasswordReset } from './PasswordReset';

export { sequelize };
