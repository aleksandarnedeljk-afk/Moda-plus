import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AdminProduct, AdminRole, Order, Product } from '../src/types/store';
import { stripPrivateProductFields } from '../src/utils/storeLogic';
import type { AdminSessionRecord, AdminUserRecord } from './types';

// Ephemeral fallback secret for token HMAC signing if SESSION_SECRET is unset
const EPHEMERAL_SIGNING_KEY = crypto.randomBytes(32).toString('hex');

function getSigningKey(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SIGNING_KEY;
}

export function hashPassword(password: string, existingSalt?: string): {
  hash: string;
  salt: string;
} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  if (!password || !storedHash || !salt) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export class SessionManager {
  private sessions = new Map<string, AdminSessionRecord>();
  private failedLogins = new Map<string, { count: number; lockedUntil: number }>();
  private trackingHits = new Map<string, { count: number; resetAt: number }>();

  createSession(user: Pick<AdminUserRecord, 'id' | 'username' | 'displayName' | 'role'>, ttlMinutes = 120): {
    token: string;
    session: AdminSessionRecord;
  } {
    const tokenId = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const session: AdminSessionRecord = {
      tokenId,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000,
    };
    this.sessions.set(tokenId, session);
    const signature = crypto
      .createHmac('sha256', getSigningKey())
      .update(tokenId)
      .digest('hex');
    return { token: `${tokenId}.${signature}`, session };
  }

  verifyBearerToken(token: string | undefined, idleTimeoutMinutes = 30): AdminSessionRecord | null {
    if (!token || !token.includes('.')) return null;
    const [tokenId, signature] = token.split('.');
    if (!tokenId || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', getSigningKey())
      .update(tokenId)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const session = this.sessions.get(tokenId);
    if (!session) return null;

    const now = Date.now();
    if (now > session.expiresAt) {
      this.sessions.delete(tokenId);
      return null;
    }
    if (now - session.lastActivityAt > idleTimeoutMinutes * 60 * 1000) {
      this.sessions.delete(tokenId);
      return null;
    }

    session.lastActivityAt = now;
    return session;
  }

  revokeToken(token: string | undefined): void {
    if (!token || !token.includes('.')) return;
    const [tokenId] = token.split('.');
    if (tokenId) this.sessions.delete(tokenId);
  }

  revokeUserSessions(userId: string): void {
    for (const [tokenId, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        this.sessions.delete(tokenId);
      }
    }
  }

  revokeAllSessions(): void {
    this.sessions.clear();
  }

  checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const rec = this.failedLogins.get(key);
    if (!rec) return { allowed: true, retryAfterSeconds: 0 };
    const now = Date.now();
    if (rec.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailedLogin(key: string): void {
    const now = Date.now();
    const current = this.failedLogins.get(key);
    const nextCount = (current && current.lockedUntil <= now ? current.count : current?.count ?? 0) + 1;
    const lockedUntil = nextCount >= 5 ? now + 5 * 60 * 1000 : 0;
    this.failedLogins.set(key, { count: nextCount, lockedUntil });
  }

  clearLoginFailures(key: string): void {
    this.failedLogins.delete(key);
  }

  checkTrackRateLimit(key: string, maxPerMinute = 20): boolean {
    const now = Date.now();
    const rec = this.trackingHits.get(key);
    if (!rec || rec.resetAt <= now) {
      this.trackingHits.set(key, { count: 1, resetAt: now + 60 * 1000 });
      return true;
    }
    rec.count += 1;
    return rec.count <= maxPerMinute;
  }
}

export function extractBearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return undefined;
  return auth.slice('Bearer '.length).trim();
}

export function createRequireAdminMiddleware(
  sessionManager: SessionManager,
  getIdleTimeoutMinutes: () => number,
) {
  return (allowedRoles?: AdminRole[]) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const token = extractBearerToken(req);
      const session = sessionManager.verifyBearerToken(token, getIdleTimeoutMinutes());
      if (!session) {
        res.status(401).json({
          error: 'Potrebna je prijava u admin panel (sesija je istekla ili nije važeća).',
        });
        return;
      }
      if (allowedRoles && !allowedRoles.includes(session.role)) {
        res.status(403).json({
          error: 'Nemate dozvolu za ovu radnju (potrebna uloga Vlasnik).',
        });
        return;
      }
      (req as Request & { adminSession: AdminSessionRecord }).adminSession = session;
      next();
    };
}

export function sanitizeProductForPublic(product: AdminProduct): Product {
  return stripPrivateProductFields(product);
}

export function sanitizeOrderForTracking(order: Order) {
  return {
    id: order.id,
    status: order.status,
    productTitle: order.productTitle,
    selectedSize: order.selectedSize,
    bundleQuantity: order.bundleQuantity,
    itemsCount: order.items?.reduce((s, i) => s + i.quantity, 0) ?? order.bundleQuantity,
    total: order.pricing.total,
    cityZip: order.customer.cityZip,
    courier: order.shipping?.courier ?? (order.pickupInPerson ? 'Lično preuzimanje' : 'Post Express'),
    trackingNumber: order.shipping?.trackingNumber,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt ?? order.createdAt,
    statusHistory: (order.statusHistory ?? []).map((h) => ({
      status: h.status,
      at: h.at,
    })),
  };
}

export function sanitizeOrderForCustomerReceipt(order: Order) {
  const items = order.items?.map((item) => {
    const copy = { ...item };
    delete copy.unitPurchasePrice;
    return copy;
  });
  return {
    ...order,
    items,
    internalNote: undefined,
    cod: undefined,
  };
}
