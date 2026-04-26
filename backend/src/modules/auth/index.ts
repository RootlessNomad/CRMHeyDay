export {
  AuthService,
  authService,
  type LoginResult,
  type PublicUserDto,
  type SessionContext,
  type TokenPair,
} from './service.js';
export { AuthError } from '../../core/auth/errors.js';
export {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '../../core/auth/tokens.js';
export { hashPassword, verifyPassword } from '../../core/auth/password.js';
