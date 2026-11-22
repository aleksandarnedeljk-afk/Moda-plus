import crypto from 'crypto';
import express from 'express';
import type {
  AdminProduct,
  AdminRole,
  CouponCode,
  ExpenseRecord,
  OrderStatus,
  ProductSize,
  PromotionRule,
} from '../src/types/store';
import { computeFinancialSummary, previewClearanceMarkdown } from '../src/utils/financeLogic';
import {
  generateProductSlug,
  normalizeSerbianLatin,
  normalizeSerbianPhoneDigits,
} from '../src/utils/storeLogic';
import { suggestProductFieldsFromImage } from './aiSuggest';
import {
  analyzeClearanceCandidates,
  applyClearanceBatchInDb,
  computeAdminAlerts,
  computeSalesStatistics,
  rollbackClearanceBatchInDb,
} from './analyticsAndClearance';
import {
  buildImportedProduct,
  exportCourierPostExpressCsv,
  exportCustomersCsv,
  exportFinancesCsv,
  exportOrdersCsv,
  exportProductsCsv,
  previewProductCsvImport,
} from './csvExportImport';
import { createStoreEngine, syncProductStockFields } from './db';
import {
  createOrderInDb,
  DomainError,
  mergeCustomersInDb,
  processOrderReturnInDb,
  reconcileInventoryInDb,
  settleCodOrdersInDb,
  transitionOrderStatusInDb,
} from './inventoryAndOrders';
import {
  createRequireAdminMiddleware,
  extractBearerToken,
  hashPassword,
  sanitizeOrderForCustomerReceipt,
  sanitizeOrderForTracking,
  sanitizeProductForPublic,
  SessionManager,
  verifyPassword,
} from './security';
import { generateRobotsTxt, generateSitemapXml } from './seo';
import type { AdminUserRecord, FullStoreDatabase } from './types';

export function createStoreApiApp(storeFilePath: string) {
  const engine = createStoreEngine(storeFilePath);
  const sessionManager = new SessionManager();

  const getIdleMinutes = () => {
    try {
      return engine.readDb().settings.autoLockMinutes || 30;
    } catch {
      return 30;
    }
  };
  const requireAdmin = createRequireAdminMiddleware(sessionManager, getIdleMinutes);

  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const handleDomainError = (err: unknown, res: express.Response) => {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({
        error: err.message,
        ...(err.validationErrors ? { validationErrors: err.validationErrors } : {}),
      });
      return;
    }
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Neočekivana greška na serveru.',
    });
  };

  // ==========================================
  // HEALTH & AUTHENTICATION ROUTES (§3 Security)
  // ==========================================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/status', (_req, res) => {
    const db = engine.readDb();
    const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim());
    const hasOwnerInDb = db.adminUsers.some((u) => u.role === 'vlasnik' && u.active);
    res.json({
      needsInitialSetup: !envPasscodeSet && !hasOwnerInDb,
      envPasscodeActive: envPasscodeSet,
      ownerDisplayName: db.settings.brandName,
    });
  });

  // First-run owner claim endpoint: locks permanently once an owner exists or ADMIN_PASSCODE is set
  app.post('/api/auth/setup', async (req, res) => {
    try {
      const { username, displayName, password } = req.body as {
        username?: string;
        displayName?: string;
        password?: string;
      };
      const envPasscode = process.env.ADMIN_PASSCODE?.trim();
      if (envPasscode) {
        res.status(403).json({
          error: 'Admin lozinka je već konfigurisana preko serverske promenljive okruženja.',
        });
        return;
      }
      if (!password || password.trim().length < 4) {
        res.status(400).json({ error: 'Lozinka / PIN mora imati najmanje 4 karaktera.' });
        return;
      }

      const result = await engine.withDbTransaction((db) => {
        if (db.adminUsers.some((u) => u.role === 'vlasnik' && u.active)) {
          throw new DomainError(403, 'Vlasnički nalog je već kreiran. Prijavite se postojećom lozinkom.');
        }
        const { hash, salt } = hashPassword(password.trim());
        const owner: AdminUserRecord = {
          id: `usr-${Date.now().toString(36)}`,
          username: (username?.trim() || 'vlasnik').toLowerCase(),
          displayName: displayName?.trim() || 'Vlasnik butika',
          role: 'vlasnik',
          passwordHash: hash,
          salt,
          active: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        db.adminUsers.push(owner);
        const { token } = sessionManager.createSession(owner);
        return {
          token,
          user: {
            id: owner.id,
            username: owner.username,
            displayName: owner.displayName,
            role: owner.role,
          },
        };
      });

      res.status(201).json(result);
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const ipKey = req.ip || 'local';
      const limitCheck = sessionManager.checkLoginRateLimit(ipKey);
      if (!limitCheck.allowed) {
        res.status(429).json({
          error: `Previše neuspešnih pokušaja prijave. Pokušajte ponovo za ${limitCheck.retryAfterSeconds} sekundi.`,
        });
        return;
      }

      const { username, password } = req.body as { username?: string; password?: string };
      const cleanPass = String(password ?? '').trim();
      const cleanUser = (username?.trim() || '').toLowerCase();

      const envPasscode = process.env.ADMIN_PASSCODE?.trim();
      if (envPasscode) {
        const envBuf = Buffer.from(envPasscode);
        const inpBuf = Buffer.from(cleanPass);
        const envUsername = (process.env.ADMIN_USERNAME || 'vlasnik').toLowerCase();
        const userOk = !cleanUser || cleanUser === envUsername;
        if (userOk && envBuf.length === inpBuf.length && crypto.timingSafeEqual(envBuf, inpBuf)) {
          sessionManager.clearLoginFailures(ipKey);
          const { token } = sessionManager.createSession({
            id: 'env-owner',
            username: envUsername,
            displayName: 'Vlasnik (ENV)',
            role: 'vlasnik',
          });
          res.json({
            token,
            user: {
              id: 'env-owner',
              username: envUsername,
              displayName: 'Vlasnik (ENV)',
              role: 'vlasnik' as AdminRole,
            },
          });
          return;
        }
      }

      const db = engine.readDb();
      if (db.adminUsers.length === 0 && !envPasscode) {
        res.status(409).json({
          error: 'Prvi vlasnički nalog još nije podešen. Dovršite početno podešavanje.',
        });
        return;
      }

      // Match specific username or sole owner PIN login when username omitted
      const matchedUser = cleanUser
        ? db.adminUsers.find((u) => u.active && u.username.toLowerCase() === cleanUser)
        : db.adminUsers.find((u) => u.active && u.role === 'vlasnik') ||
          db.adminUsers.find((u) => u.active);

      if (!matchedUser || !verifyPassword(cleanPass, matchedUser.passwordHash, matchedUser.salt)) {
        sessionManager.recordFailedLogin(ipKey);
        res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka / PIN.' });
        return;
      }

      sessionManager.clearLoginFailures(ipKey);
      await engine.withDbTransaction((mutableDb) => {
        const u = mutableDb.adminUsers.find((usr) => usr.id === matchedUser.id);
        if (u) u.lastLoginAt = new Date().toISOString();
      });

      const { token } = sessionManager.createSession(matchedUser);
      res.json({
        token,
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          displayName: matchedUser.displayName,
          role: matchedUser.role,
        },
      });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    sessionManager.revokeToken(token);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAdmin(), (req, res) => {
    const session = (req as express.Request & { adminSession: { userId: string; username: string; displayName: string; role: AdminRole } }).adminSession;
    res.json({ user: session });
  });

  app.post('/api/auth/change-password', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { userId: string } }).adminSession;
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!newPassword || newPassword.trim().length < 4) {
        res.status(400).json({ error: 'Nova lozinka mora imati najmanje 4 karaktera.' });
        return;
      }

      await engine.withDbTransaction((db) => {
        const user = db.adminUsers.find((u) => u.id === session.userId);
        if (!user) {
          throw new DomainError(400, 'Promena lozinke nije dostupna za sistemski ENV nalog.');
        }
        if (!verifyPassword(String(currentPassword ?? ''), user.passwordHash, user.salt)) {
          throw new DomainError(401, 'Trenutna lozinka nije tačna.');
        }
        const { hash, salt } = hashPassword(newPassword.trim());
        user.passwordHash = hash;
        user.salt = salt;
        sessionManager.revokeUserSessions(user.id);
      });

      const refreshedDb = engine.readDb();
      const updatedUser = refreshedDb.adminUsers.find((u) => u.id === session.userId)!;
      const { token } = sessionManager.createSession(updatedUser);
      res.json({ ok: true, token });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // ==========================================
  // PUBLIC STOREFRONT & SEO ROUTES (§18, §26)
  // ==========================================
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    res.type('text/plain').send(generateRobotsTxt(baseUrl));
  });

  app.get('/sitemap.xml', (req, res) => {
    const db = engine.readDb();
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    res.type('application/xml').send(generateSitemapXml(db, baseUrl));
  });

  app.get('/api/storefront', (_req, res) => {
    const db = engine.readDb();
    const publicProducts = db.products
      .filter((p) => p.status !== 'Nacrt' && p.status !== 'Arhiviran')
      .map(sanitizeProductForPublic);
    const approvedReviews = db.reviews.filter((r) => r.status !== 'hidden' && r.status !== 'pending');
    const activePromotions = db.promotions.filter((pr) => pr.active);
    res.json({
      products: publicProducts,
      categories: db.categories.filter((c) => c.visible).sort((a, b) => a.sortOrder - b.sortOrder),
      legalPages: db.legalPages,
      settings: db.settings,
      promotions: activePromotions,
      reviews: approvedReviews,
    });
  });

  app.get('/api/products', (_req, res) => {
    const db = engine.readDb();
    res.json({
      products: db.products
        .filter((p) => p.status !== 'Nacrt' && p.status !== 'Arhiviran')
        .map(sanitizeProductForPublic),
    });
  });

  app.get('/api/products/:slugOrId', (req, res) => {
    const { slugOrId } = req.params;
    const db = engine.readDb();
    const found = db.products.find(
      (p) =>
        p.id === slugOrId ||
        p.slug === slugOrId ||
        slugOrId.endsWith(`-${p.id}`),
    );
    if (!found || found.status === 'Nacrt' || found.status === 'Arhiviran') {
      res.status(404).json({ error: 'Artikal nije pronađen.' });
      return;
    }
    res.json({ product: sanitizeProductForPublic(found) });
  });

  app.post('/api/promotions/validate', (req, res) => {
    const { code } = req.body as { code?: string };
    const clean = (code || '').trim().toUpperCase();
    if (!clean) {
      res.status(400).json({ error: 'Unesite kod kupona.' });
      return;
    }
    const db = engine.readDb();
    const coupon = db.coupons.find((c) => c.code.toUpperCase() === clean);
    if (!coupon || !coupon.active) {
      res.status(404).json({ error: 'Kupon nije pronađen ili nije aktivan.' });
      return;
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: 'Kupon je istekao.' });
      return;
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: 'Kupon je iskorišćen.' });
      return;
    }
    res.json({ coupon });
  });

  // Public Order Creation (1-step COD + Multi-item Cart + Idempotency + Atomic Transaction)
  app.post('/api/orders', async (req, res) => {
    try {
      const result = await engine.withDbTransaction((db) => {
        const body = req.body as Record<string, unknown>;
        return createOrderInDb(
          db,
          {
            productId: body.productId as string | undefined,
            selectedSize: body.selectedSize as ProductSize | undefined,
            bundleQuantity: body.bundleQuantity as 1 | 2 | 3 | undefined,
            items: body.items as {
              productId: string;
              size: ProductSize;
              color?: string;
              quantity: number;
            }[],
            customer: body.customer as {
              fullName: string;
              street: string;
              cityZip: string;
              phone: string;
              email?: string;
              note?: string;
            },
            couponCode: body.couponCode as string | undefined,
            giftWrap: Boolean(body.giftWrap),
            pickupInPerson: Boolean(body.pickupInPerson),
            idempotencyKey: body.idempotencyKey as string | undefined,
            source: 'Internet prodavnica',
          },
          'kupac',
          false,
        );
      });

      const publicUpdatedProducts = result.updatedProducts.map(sanitizeProductForPublic);
      res.status(result.idempotentReplay ? 200 : 201).json({
        order: sanitizeOrderForCustomerReceipt(result.order),
        updatedProduct: publicUpdatedProducts[0],
        updatedProducts: publicUpdatedProducts,
        idempotentReplay: result.idempotentReplay,
      });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Privacy-safe Order Tracking (§18): requires Order Code + Phone Last-4 OR private tracking token
  app.get('/api/orders/track', (req, res) => {
    const ipKey = req.ip || 'local';
    if (!sessionManager.checkTrackRateLimit(ipKey)) {
      res.status(429).json({
        error: 'Previše provera statusa u kratkom roku. Sačekajte minut pa pokušajte ponovo.',
      });
      return;
    }

    const code = String(req.query.code ?? req.query.q ?? '').trim().toLowerCase();
    const phoneLast4 = String(req.query.phoneLast4 ?? '').replace(/\D/g, '').slice(-4);
    const token = String(req.query.token ?? '').trim();

    if (!code || code.length < 4) {
      res.status(400).json({ error: 'Unesite šifru porudžbine (npr. AO-2611-4821).' });
      return;
    }

    if (!token && phoneLast4.length !== 4) {
      res.status(400).json({
        error: 'Radi zaštite privatnosti unesite i poslednje 4 cifre broja telefona.',
      });
      return;
    }

    const db = engine.readDb();
    const matches = db.orders
      .filter((order) => {
        if (order.id.toLowerCase() !== code) return false;
        if (token && order.trackingToken && order.trackingToken === token) return true;
        const orderPhoneDigits = normalizeSerbianPhoneDigits(order.customer.phone);
        return phoneLast4.length === 4 && orderPhoneDigits.endsWith(phoneLast4);
      })
      .map(sanitizeOrderForTracking);

    res.json({ matches });
  });

  // Verified Post-Delivery Review Submission (§28)
  app.post('/api/reviews', async (req, res) => {
    try {
      const { orderCode, phoneLast4, rating, comment, productId } = req.body as {
        orderCode?: string;
        phoneLast4?: string;
        rating?: number;
        comment?: string;
        productId?: string;
      };
      const cleanCode = String(orderCode ?? '').trim().toLowerCase();
      const cleanPhone4 = String(phoneLast4 ?? '').replace(/\D/g, '').slice(-4);
      const cleanComment = String(comment ?? '').trim();
      const cleanRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));

      if (!cleanCode || cleanPhone4.length !== 4 || cleanComment.length < 5) {
        res.status(400).json({
          error: 'Unesite šifru porudžbine, poslednje 4 cifre telefona i komentar (min 5 karaktera).',
        });
        return;
      }

      const review = await engine.withDbTransaction((db) => {
        const matchedOrder = db.orders.find((o) => {
          if (o.id.toLowerCase() !== cleanCode) return false;
          const digits = normalizeSerbianPhoneDigits(o.customer.phone);
          return digits.endsWith(cleanPhone4);
        });
        if (!matchedOrder) {
          throw new DomainError(404, 'Porudžbina sa tim podacima nije pronađena.');
        }
        if (matchedOrder.status !== 'Isporučena') {
          throw new DomainError(
            400,
            'Recenziju mogu ostaviti kupci nakon što porudžbina dobije status Isporučena.',
          );
        }

        const parts = matchedOrder.customer.fullName.trim().split(/\s+/);
        const shortName =
          parts.length >= 2 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
        const initials = parts
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() || '')
          .join('');

        const newReview = {
          id: `rev-${Date.now().toString(36)}`,
          name: shortName,
          initials: initials || 'K',
          dateLabel: 'danas',
          rating: cleanRating,
          comment: cleanComment,
          productId: productId || matchedOrder.productId,
          orderId: matchedOrder.id,
          verifiedPurchase: true,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        };
        db.reviews.unshift(newReview);
        return newReview;
      });

      res.status(201).json({
        review,
        message: 'Hvala! Vaš utisak je prosleđen na pregled i biće objavljen uskoro.',
      });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/restock-alerts', async (req, res) => {
    try {
      const { productId, size, contact, consentGiven } = req.body as {
        productId?: string;
        size?: ProductSize;
        contact?: string;
        consentGiven?: boolean;
      };
      if (!productId || !size || !contact?.trim() || !consentGiven) {
        res.status(400).json({
          error: 'Unesite kontakt (telefon/email) i potvrdite saglasnost za obaveštenje.',
        });
        return;
      }

      const sub = await engine.withDbTransaction((db) => {
        const prod = db.products.find((p) => p.id === productId);
        if (!prod) throw new DomainError(404, 'Artikal nije pronađen.');
        const entry = {
          id: `rst-${Date.now().toString(36)}`,
          productId,
          productTitle: prod.title,
          size,
          contact: contact.trim(),
          consentGiven: true,
          notified: false,
          createdAt: new Date().toISOString(),
        };
        db.restockSubscriptions.unshift(entry);
        return entry;
      });
      res.status(201).json({ subscription: sub });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // ==========================================
  // PROTECTED ADMIN ROUTES (requireAdmin)
  // ==========================================
  app.get('/api/admin/bootstrap', requireAdmin(), (req, res) => {
    const db = engine.readDb();
    const { from, to } = req.query as { from?: string; to?: string };
    const sortedOrders = [...db.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.json({
      products: db.products,
      orders: sortedOrders,
      customers: db.customers,
      stockMovements: db.stockMovements.slice(0, 300),
      priceHistory: db.priceHistory,
      expenses: db.expenses,
      promotions: db.promotions,
      coupons: db.coupons,
      reviews: db.reviews,
      restockSubscriptions: db.restockSubscriptions,
      categories: db.categories,
      legalPages: db.legalPages,
      settings: db.settings,
      users: db.adminUsers.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      financials: computeFinancialSummary(db.orders, db.products, db.expenses, {
        fromIso: from,
        toIso: to,
      }),
      stats: computeSalesStatistics(db, from, to),
      alerts: computeAdminAlerts(db),
      backups: engine.listBackups(),
    });
  });

  // Admin Products CRUD & Fast Entry
  app.get('/api/admin/products', requireAdmin(), (_req, res) => {
    const db = engine.readDb();
    res.json({ products: db.products });
  });

  const createAdminProductHandler: express.RequestHandler = async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const body = req.body as Partial<AdminProduct>;
      const title = body.title?.trim();
      if (!title || title.length < 2) {
        res.status(400).json({ error: 'Naziv artikla je obavezan.' });
        return;
      }
      const salePrice = Number(body.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        res.status(400).json({ error: 'Unesite validnu akcijsku cenu u RSD.' });
        return;
      }

      const created = await engine.withDbTransaction((db) => {
        const id = `ao-${Date.now().toString(36)}`;
        const rawOrig = Number(body.originalPrice);
        const purchaseRaw =
          body.purchasePrice !== undefined && body.purchasePrice !== null && String(body.purchasePrice) !== ''
            ? Number(body.purchasePrice)
            : null;
        const minAllowedRaw =
          body.minAllowedPrice !== undefined && body.minAllowedPrice !== null && String(body.minAllowedPrice) !== ''
            ? Number(body.minAllowedPrice)
            : null;

        const cleanGallery =
          Array.isArray(body.galleryImages) && body.galleryImages.length > 0
            ? body.galleryImages.filter((u) => typeof u === 'string' && u.trim())
            : [
                body.imageUrl?.trim() ||
                  '/src/assets/images/dress_black_midi_1795368188456.jpg',
              ];

        const prod = syncProductStockFields({
          id,
          sku: body.sku?.trim() || `AO-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          slug: generateProductSlug(title, id),
          brand: body.brand?.trim() || undefined,
          title,
          category: body.category || 'Ostalo',
          subcategory: body.subcategory?.trim() || undefined,
          genderAge: body.genderAge || 'Žene',
          color: body.color?.trim() || 'Osnovna',
          description:
            body.description?.trim() ||
            'Nov artikal iz butik likvidacije zaliha, sa originalnom etiketom.',
          materialNote:
            body.materialNote?.trim() || 'Novo sa etiketom · Ograničena količina',
          sizeGuideType: body.sizeGuideType || 'žene',
          purchasePrice:
            purchaseRaw !== null && Number.isFinite(purchaseRaw) && purchaseRaw >= 0
              ? Math.round(purchaseRaw)
              : null,
          minAllowedPrice:
            minAllowedRaw !== null && Number.isFinite(minAllowedRaw) && minAllowedRaw >= 0
              ? Math.round(minAllowedRaw)
              : null,
          salePrice: Math.round(salePrice),
          originalPrice:
            Number.isFinite(rawOrig) && rawOrig > salePrice
              ? Math.round(rawOrig)
              : Math.round(salePrice * 1.8),
          imageUrl: cleanGallery[0],
          galleryImages: cleanGallery,
          stockBySize: body.stockBySize || {},
          variants: body.variants,
          isNew: body.isNew ?? true,
          active: body.status === 'Nacrt' || body.status === 'Skriven' ? false : (body.active ?? true),
          status: body.status || 'Aktivan',
          supplier: body.supplier?.trim() || undefined,
          warehouseLocation: body.warehouseLocation?.trim() || undefined,
          internalNote: body.internalNote?.trim() || undefined,
          acquiredAt: body.acquiredAt || new Date().toISOString(),
          publishedAt: body.status === 'Nacrt' ? undefined : new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        for (const v of prod.variants ?? []) {
          if (v.physicalStock > 0) {
            db.stockMovements.unshift({
              id: `mov-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
              productId: prod.id,
              productTitle: prod.title,
              variantId: v.id,
              sku: v.sku,
              size: v.size,
              color: v.color,
              type: 'Početno stanje',
              delta: v.physicalStock,
              physicalAfter: v.physicalStock,
              reservedAfter: 0,
              reason: 'Početni unos artikla',
              actor: session.username,
              createdAt: new Date().toISOString(),
            });
          }
        }

        db.products.unshift(prod);
        return prod;
      });

      res.status(201).json({ product: created });
    } catch (err) {
      handleDomainError(err, res);
    }
  };

  app.post('/api/admin/products', requireAdmin(), createAdminProductHandler);
  app.post('/api/products', requireAdmin(), createAdminProductHandler);

  app.patch('/api/admin/products/:id', requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const patch = req.body as Partial<AdminProduct>;
      const updated = await engine.withDbTransaction((db) => {
        const idx = db.products.findIndex((p) => p.id === id);
        if (idx === -1) throw new DomainError(404, 'Artikal nije pronađen.');
        const existing = db.products[idx];

        let nextVariants = patch.variants ?? existing.variants;
        // If client sent stockBySize without variants, sync variants' physicalStock cleanly
        if (patch.stockBySize && !patch.variants && existing.variants) {
          const cloned = existing.variants.map((v) => ({ ...v }));
          for (const [sz, qty] of Object.entries(patch.stockBySize)) {
            const target = Math.max(0, Math.floor(Number(qty) || 0));
            const found = cloned.find((v) => v.size === sz);
            if (found) {
              found.physicalStock = target + found.reservedStock;
            } else {
              cloned.push({
                id: `${existing.id}-${sz}`,
                sku: `${existing.sku || existing.id}-${sz}`,
                color: patch.color || existing.color || 'Osnovna',
                size: sz as ProductSize,
                physicalStock: target,
                reservedStock: 0,
                soldCount: 0,
                returnedCount: 0,
                damagedCount: 0,
              });
            }
          }
          nextVariants = cloned;
        }

        const merged = syncProductStockFields({
          ...existing,
          ...patch,
          variants: nextVariants,
          updatedAt: new Date().toISOString(),
        });
        db.products[idx] = merged;
        return merged;
      });
      res.json({ product: updated });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.delete('/api/admin/products/:id', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const { id } = req.params;
      await engine.withDbTransaction((db) => {
        const before = db.products.length;
        db.products = db.products.filter((p) => p.id !== id);
        if (db.products.length === before) {
          throw new DomainError(404, 'Artikal nije pronađen.');
        }
      });
      res.json({ deletedId: id });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/products/bulk-upload', requireAdmin(), async (req, res) => {
    try {
      const { items } = req.body as {
        items?: {
          title: string;
          category: string;
          salePrice: number;
          originalPrice?: number;
          purchasePrice?: number | null;
          imageUrl: string;
          stockBySize: Partial<Record<ProductSize, number>>;
        }[];
      };
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Dodajte bar jednu fotografiju/artikal.' });
        return;
      }

      const created = await engine.withDbTransaction((db) => {
        const list: AdminProduct[] = [];
        const now = Date.now();
        items.forEach((item, idx) => {
          const id = `ao-${(now + idx).toString(36)}`;
          const sale = Math.max(100, Math.round(Number(item.salePrice) || 1490));
          const orig = Math.max(
            sale,
            Math.round(Number(item.originalPrice) || sale * 2),
          );
          const prod = syncProductStockFields({
            id,
            sku: `BLK-${(now + idx).toString(36).toUpperCase().slice(-5)}`,
            slug: generateProductSlug(item.title || `Novi artikal ${idx + 1}`, id),
            title: item.title?.trim() || `Outlet artikal ${idx + 1}`,
            category: item.category || 'Ostalo',
            description: 'Nov artikal iz outlet ponude sa originalnom etiketom.',
            materialNote: 'Novo sa etiketom',
            purchasePrice: item.purchasePrice ?? null,
            salePrice: sale,
            originalPrice: orig,
            imageUrl: item.imageUrl,
            galleryImages: [item.imageUrl],
            stockBySize: item.stockBySize || { Univerzalna: 1 },
            isNew: true,
            active: true,
            status: 'Aktivan',
            createdAt: new Date().toISOString(),
          });
          db.products.unshift(prod);
          list.push(prod);
        });
        return list;
      });
      res.status(201).json({ products: created });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/ai-suggest', requireAdmin(), async (req, res) => {
    try {
      const { imageDataUrl, sellerNotes } = req.body as {
        imageDataUrl?: string;
        sellerNotes?: string;
      };
      const db = engine.readDb();
      const suggestion = await suggestProductFieldsFromImage({
        imageDataUrl,
        sellerNotes,
        categories: db.categories.map((c) => c.name),
      });
      res.json({ suggestion });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'AI predlog trenutno nije dostupan.',
      });
    }
  });

  // Inventory Reconciliation & Movements
  app.post('/api/admin/inventory/adjust', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { productId, adjustments, reason } = req.body as {
        productId?: string;
        adjustments?: { size: ProductSize; color?: string; newPhysicalStock: number }[];
        reason?: string;
      };
      if (!productId || !Array.isArray(adjustments) || adjustments.length === 0) {
        res.status(400).json({ error: 'Nedostaju podaci za inventuru zaliha.' });
        return;
      }

      const product = await engine.withDbTransaction((db) =>
        reconcileInventoryInDb(
          db,
          productId,
          adjustments,
          reason || 'Inventura stanja',
          session.username,
        ),
      );
      res.json({ product });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Admin Orders (List, Manual Social/Phone Order, Status Transition, Return/Damaged, Bulk, COD Settle)
  app.get('/api/admin/orders', requireAdmin(), (_req, res) => {
    const db = engine.readDb();
    const sorted = [...db.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.json({ orders: sorted });
  });

  app.post('/api/admin/orders/manual', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const result = await engine.withDbTransaction((db) =>
        createOrderInDb(db, req.body, session.username, true),
      );
      res.status(201).json({
        order: result.order,
        updatedProducts: result.updatedProducts,
      });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.patch('/api/admin/orders/:id/status', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { id } = req.params;
      const { status, trackingNumber, actualShippingCost, returnCost, note } = req.body as {
        status?: OrderStatus;
        trackingNumber?: string;
        actualShippingCost?: number;
        returnCost?: number;
        note?: string;
      };
      if (!status) {
        res.status(400).json({ error: 'Nedostaje novi status porudžbine.' });
        return;
      }
      const result = await engine.withDbTransaction((db) =>
        transitionOrderStatusInDb(db, id, status, {
          trackingNumber,
          actualShippingCost,
          returnCost,
          note,
          actor: session.username,
        }),
      );
      res.json(result);
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/orders/bulk-status', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { orderIds, status } = req.body as { orderIds?: string[]; status?: OrderStatus };
      if (!Array.isArray(orderIds) || orderIds.length === 0 || !status) {
        res.status(400).json({ error: 'Izaberite porudžbine i ciljni status.' });
        return;
      }
      const results = await engine.withDbTransaction((db) => {
        const orders = [];
        for (const oid of orderIds) {
          const r = transitionOrderStatusInDb(db, oid, status, { actor: session.username });
          orders.push(r.order);
        }
        return orders;
      });
      res.json({ orders: results });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/orders/:id/return', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { id } = req.params;
      const result = await engine.withDbTransaction((db) =>
        processOrderReturnInDb(db, id, req.body, session.username),
      );
      res.json(result);
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/orders/cod-settle', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { settlements } = req.body as {
        settlements?: {
          orderId: string;
          receivedAmount?: number;
          courierFee?: number;
          discrepancyNote?: string;
        }[];
      };
      if (!Array.isArray(settlements) || settlements.length === 0) {
        res.status(400).json({ error: 'Izaberite bar jednu isporučenu porudžbinu za rasknjižavanje.' });
        return;
      }
      const orders = await engine.withDbTransaction((db) =>
        settleCodOrdersInDb(db, settlements, session.username),
      );
      res.json({ orders });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // CRM Customers & Merge
  app.patch('/api/admin/customers/:id', requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const { internalNote, fullName, street, cityZip } = req.body as {
        internalNote?: string;
        fullName?: string;
        street?: string;
        cityZip?: string;
      };
      const customer = await engine.withDbTransaction((db) => {
        const c = db.customers.find((cust) => cust.id === id);
        if (!c) throw new DomainError(404, 'Kupac nije pronađen.');
        if (typeof internalNote === 'string') c.internalNote = internalNote.trim();
        if (typeof fullName === 'string' && fullName.trim()) c.fullName = fullName.trim();
        if (typeof street === 'string' && street.trim()) c.street = street.trim();
        if (typeof cityZip === 'string' && cityZip.trim()) c.cityZip = cityZip.trim();
        return c;
      });
      res.json({ customer });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/customers/merge', requireAdmin(), async (req, res) => {
    try {
      const { primaryId, duplicateId } = req.body as { primaryId?: string; duplicateId?: string };
      if (!primaryId || !duplicateId) {
        res.status(400).json({ error: 'Izaberite oba profila kupaca.' });
        return;
      }
      const customer = await engine.withDbTransaction((db) =>
        mergeCustomersInDb(db, primaryId, duplicateId),
      );
      res.json({ customer });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Clearance Automation ("Rasprodaja zaliha")
  app.get('/api/admin/clearance/candidates', requireAdmin(), (req, res) => {
    const days = Math.max(1, Number(req.query.days) || 7);
    const db = engine.readDb();
    res.json(analyzeClearanceCandidates(db.products, days));
  });

  app.post('/api/admin/clearance/preview', requireAdmin(), (req, res) => {
    const { targetProductIds, mode, value, roundToEnding90 } = req.body as {
      targetProductIds: string[];
      mode: 'percent' | 'fixed_rsd';
      value: number;
      roundToEnding90?: boolean;
    };
    const db = engine.readDb();
    const rows = previewClearanceMarkdown({
      products: db.products,
      targetProductIds: targetProductIds || [],
      mode: mode || 'percent',
      value: Number(value) || 0,
      roundToEnding90: Boolean(roundToEnding90),
    });
    res.json({ preview: rows });
  });

  app.post('/api/admin/clearance/apply', requireAdmin(), async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession: { username: string } }).adminSession;
      const { label, targetProductIds, mode, value, roundToEnding90 } = req.body as {
        label?: string;
        targetProductIds: string[];
        mode: 'percent' | 'fixed_rsd';
        value: number;
        roundToEnding90?: boolean;
      };
      const result = await engine.withDbTransaction((db) =>
        applyClearanceBatchInDb(db, {
          label: label || 'Akcijsko sniženje',
          targetProductIds: targetProductIds || [],
          mode: mode || 'percent',
          value: Number(value) || 0,
          roundToEnding90: Boolean(roundToEnding90),
          actor: session.username,
        }),
      );
      res.json(result);
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/clearance/rollback/:batchId', requireAdmin(), async (req, res) => {
    try {
      const result = await engine.withDbTransaction((db) =>
        rollbackClearanceBatchInDb(db, req.params.batchId),
      );
      res.json(result);
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Finances & Operating Expenses
  app.get('/api/admin/finances', requireAdmin(), (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const db = engine.readDb();
    res.json({
      financials: computeFinancialSummary(db.orders, db.products, db.expenses, {
        fromIso: from,
        toIso: to,
      }),
      expenses: db.expenses,
      stats: computeSalesStatistics(db, from, to),
    });
  });

  app.post('/api/admin/expenses', requireAdmin(), async (req, res) => {
    try {
      const { category, description, amountRsd, date } = req.body as Partial<ExpenseRecord>;
      const amt = Math.round(Number(amountRsd) || 0);
      if (!description?.trim() || amt <= 0) {
        res.status(400).json({ error: 'Unesite opis i iznos troška u RSD.' });
        return;
      }
      const expense = await engine.withDbTransaction((db) => {
        const rec: ExpenseRecord = {
          id: `exp-${Date.now().toString(36)}`,
          category: category || 'Ambalaža',
          description: description.trim(),
          amountRsd: amt,
          date: date || new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        db.expenses.unshift(rec);
        return rec;
      });
      res.status(201).json({ expense });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.delete('/api/admin/expenses/:id', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      await engine.withDbTransaction((db) => {
        db.expenses = db.expenses.filter((e) => e.id !== req.params.id);
      });
      res.json({ deletedId: req.params.id });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Promotions & Coupons
  app.post('/api/admin/promotions', requireAdmin(), async (req, res) => {
    try {
      const body = req.body as Partial<PromotionRule>;
      if (!body.name?.trim()) {
        res.status(400).json({ error: 'Unesite naziv promocije.' });
        return;
      }
      const promo = await engine.withDbTransaction((db) => {
        const rec: PromotionRule = {
          id: `prm-${Date.now().toString(36)}`,
          name: body.name!.trim(),
          type: body.type || 'cart_threshold_percent',
          active: body.active ?? true,
          targetCategory: body.targetCategory,
          minCartRsd: Number(body.minCartRsd) || 0,
          discountPercent: Number(body.discountPercent) || 0,
          stackWithBundle: Boolean(body.stackWithBundle),
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          createdAt: new Date().toISOString(),
        };
        db.promotions.unshift(rec);
        return rec;
      });
      res.status(201).json({ promotion: promo });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.patch('/api/admin/promotions/:id', requireAdmin(), async (req, res) => {
    try {
      const promo = await engine.withDbTransaction((db) => {
        const p = db.promotions.find((x) => x.id === req.params.id);
        if (!p) throw new DomainError(404, 'Promocija nije pronađena.');
        Object.assign(p, req.body);
        return p;
      });
      res.json({ promotion: promo });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/coupons', requireAdmin(), async (req, res) => {
    try {
      const body = req.body as Partial<CouponCode>;
      const code = body.code?.trim().toUpperCase();
      if (!code || code.length < 3) {
        res.status(400).json({ error: 'Unesite kod kupona (npr. OUTLET10).' });
        return;
      }
      const coupon = await engine.withDbTransaction((db) => {
        if (db.coupons.some((c) => c.code.toUpperCase() === code)) {
          throw new DomainError(409, 'Kupon sa tim kodom već postoji.');
        }
        const rec: CouponCode = {
          id: `cpn-${Date.now().toString(36)}`,
          code,
          discountType: body.discountType || 'percent',
          value: Math.max(1, Math.round(Number(body.value) || 10)),
          minOrderRsd: Math.max(0, Math.round(Number(body.minOrderRsd) || 0)),
          maxUses: body.maxUses ? Math.round(Number(body.maxUses)) : null,
          usedCount: 0,
          active: body.active ?? true,
          expiresAt: body.expiresAt,
          createdAt: new Date().toISOString(),
        };
        db.coupons.unshift(rec);
        return rec;
      });
      res.status(201).json({ coupon });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.patch('/api/admin/coupons/:id', requireAdmin(), async (req, res) => {
    try {
      const coupon = await engine.withDbTransaction((db) => {
        const c = db.coupons.find((x) => x.id === req.params.id);
        if (!c) throw new DomainError(404, 'Kupon nije pronađen.');
        Object.assign(c, req.body);
        return c;
      });
      res.json({ coupon });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Reviews Moderation
  app.patch('/api/admin/reviews/:id', requireAdmin(), async (req, res) => {
    try {
      const { status } = req.body as { status?: 'approved' | 'pending' | 'hidden' };
      const review = await engine.withDbTransaction((db) => {
        const r = db.reviews.find((x) => String(x.id) === req.params.id);
        if (!r) throw new DomainError(404, 'Recenzija nije pronađena.');
        if (status) r.status = status;
        return r;
      });
      res.json({ review });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // Settings, Categories, Legal Pages & Admin Users (Owner-gated for sensitive config)
  app.patch('/api/admin/settings', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const settings = await engine.withDbTransaction((db) => {
        db.settings = {
          ...db.settings,
          ...req.body,
        };
        return db.settings;
      });
      res.json({ settings });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.put('/api/admin/categories', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const { categories } = req.body as {
        categories?: { id?: string; name: string; visible?: boolean; sortOrder?: number }[];
      };
      if (!Array.isArray(categories) || categories.length === 0) {
        res.status(400).json({ error: 'Lista kategorija ne može biti prazna.' });
        return;
      }
      const next = await engine.withDbTransaction((db) => {
        db.categories = categories.map((c, idx) => ({
          id: c.id || `cat-${Date.now().toString(36)}-${idx}`,
          name: c.name.trim(),
          slug: normalizeSerbianLatin(c.name)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          sortOrder: c.sortOrder ?? idx + 1,
          visible: c.visible ?? true,
        }));
        return db.categories;
      });
      res.json({ categories: next });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.put('/api/admin/legal/:slug', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const { slug } = req.params;
      const { title, content } = req.body as { title?: string; content?: string };
      const updated = await engine.withDbTransaction((db) => {
        const page = db.legalPages.find((p) => p.slug === slug);
        if (!page) throw new DomainError(404, 'Stranica nije pronađena.');
        if (title?.trim()) page.title = title.trim();
        if (typeof content === 'string') page.content = content.trim();
        page.updatedAt = new Date().toISOString();
        return page;
      });
      res.json({ legalPage: updated });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.post('/api/admin/users', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const { username, displayName, password, role } = req.body as {
        username?: string;
        displayName?: string;
        password?: string;
        role?: AdminRole;
      };
      const cleanUser = username?.trim().toLowerCase();
      if (!cleanUser || !password || password.trim().length < 4) {
        res.status(400).json({ error: 'Korisničko ime i lozinka (min 4 karaktera) su obavezni.' });
        return;
      }
      const created = await engine.withDbTransaction((db) => {
        if (db.adminUsers.some((u) => u.username.toLowerCase() === cleanUser)) {
          throw new DomainError(409, 'Korisničko ime već postoji.');
        }
        const { hash, salt } = hashPassword(password.trim());
        const user: AdminUserRecord = {
          id: `usr-${Date.now().toString(36)}`,
          username: cleanUser,
          displayName: displayName?.trim() || cleanUser,
          role: role === 'vlasnik' ? 'vlasnik' : 'zaposleni',
          passwordHash: hash,
          salt,
          active: true,
          createdAt: new Date().toISOString(),
        };
        db.adminUsers.push(user);
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt,
        };
      });
      res.status(201).json({ user: created });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  // CSV Export & Import + Backups (§24)
  app.get('/api/admin/export/:type', requireAdmin(), (req, res) => {
    const db = engine.readDb();
    const { type } = req.params;
    const stamp = new Date().toISOString().slice(0, 10);
    let csv = '';
    let filename = `modaplus-export-${stamp}.csv`;
    if (type === 'products') {
      csv = exportProductsCsv(db.products);
      filename = `artikli-${stamp}.csv`;
    } else if (type === 'orders') {
      csv = exportOrdersCsv(db.orders);
      filename = `porudzbine-${stamp}.csv`;
    } else if (type === 'courier') {
      csv = exportCourierPostExpressCsv(db.orders);
      filename = `post-express-slanje-${stamp}.csv`;
    } else if (type === 'customers') {
      csv = exportCustomersCsv(db.customers);
      filename = `kupci-${stamp}.csv`;
    } else if (type === 'finances') {
      csv = exportFinancesCsv(db.orders, db.products, db.expenses);
      filename = `finansije-${stamp}.csv`;
    } else {
      res.status(400).json({ error: 'Nepoznat tip izvoza.' });
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  app.post('/api/admin/import/products', requireAdmin(), async (req, res) => {
    try {
      const { csvText, commit, skipDuplicates } = req.body as {
        csvText?: string;
        commit?: boolean;
        skipDuplicates?: boolean;
      };
      if (!csvText?.trim()) {
        res.status(400).json({ error: 'Nalepite ili učitajte CSV sadržaj.' });
        return;
      }

      if (!commit) {
        const db = engine.readDb();
        const preview = previewProductCsvImport(csvText, db.products);
        res.json({ preview });
        return;
      }

      const imported = await engine.withDbTransaction((db) => {
        const preview = previewProductCsvImport(csvText, db.products);
        const created: AdminProduct[] = [];
        for (const row of preview) {
          if (row.error) continue;
          if (skipDuplicates !== false && row.duplicateReason) continue;
          const prod = buildImportedProduct(row);
          db.products.unshift(prod);
          created.push(prod);
        }
        return created;
      });
      res.status(201).json({ importedCount: imported.length, products: imported });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  app.get('/api/admin/backups', requireAdmin(['vlasnik']), (_req, res) => {
    res.json({ backups: engine.listBackups() });
  });

  app.post('/api/admin/backups/create', requireAdmin(['vlasnik']), (_req, res) => {
    const info = engine.createBackupSnapshot('manual');
    res.status(201).json({ backup: info, backups: engine.listBackups() });
  });

  app.get('/api/admin/backups/download', requireAdmin(['vlasnik']), (req, res) => {
    const fileName = String(req.query.file ?? '');
    if (fileName) {
      const snap = engine.readBackupFile(fileName);
      if (!snap) {
        res.status(404).json({ error: 'Backup fajl nije pronađen.' });
        return;
      }
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.json(snap);
      return;
    }
    const db = engine.readDb();
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="modaplus-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.json(db);
  });

  app.post('/api/admin/backups/restore', requireAdmin(['vlasnik']), async (req, res) => {
    try {
      const { fileName, snapshot } = req.body as {
        fileName?: string;
        snapshot?: Partial<FullStoreDatabase>;
      };

      // Safety snapshot before restoring
      engine.createBackupSnapshot('pre-restore');

      let parsedSnapshot: FullStoreDatabase | null = null;
      if (fileName) {
        parsedSnapshot = engine.readBackupFile(fileName);
      } else if (snapshot && Array.isArray(snapshot.products) && Array.isArray(snapshot.orders)) {
        const { migrateStoreDatabase } = await import('./db');
        parsedSnapshot = migrateStoreDatabase(snapshot);
      }

      if (!parsedSnapshot) {
        res.status(400).json({ error: 'Neispravan backup fajl ili podaci za vraćanje.' });
        return;
      }

      await engine.withDbTransaction((db) => {
        Object.assign(db, parsedSnapshot);
      });

      res.json({ ok: true, restoredProducts: parsedSnapshot.products.length });
    } catch (err) {
      handleDomainError(err, res);
    }
  });

  return { app, engine, sessionManager };
}
