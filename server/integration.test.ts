import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AdminProduct } from '../src/types/store';
import { createStoreApiApp } from './app';
import { injectSeoIntoHtml } from './seo';

async function startTempServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modaplus-test-'));
  const storePath = path.join(tempDir, 'store.json');
  const { app, engine } = createStoreApiApp(storePath);

  // Seed one deterministic test product with 1 piece in S and 3 pieces in M + purchasePrice
  await engine.withDbTransaction((db) => {
    const prod: AdminProduct = {
      id: 'ao-test-1',
      sku: 'TST-001',
      slug: 'test-haljina-ao-test-1',
      title: 'Test Crna Haljina',
      category: 'Ženske haljine',
      description: 'Test opis',
      materialNote: 'Pamuk',
      purchasePrice: 900,
      minAllowedPrice: 1100,
      salePrice: 1990,
      originalPrice: 3990,
      imageUrl: '/src/assets/images/dress_black_midi_1795368188456.jpg',
      stockBySize: { S: 1, M: 3 },
      variants: [
        {
          id: 'ao-test-1-S',
          sku: 'TST-001-S',
          color: 'Crna',
          size: 'S',
          physicalStock: 1,
          reservedStock: 0,
          soldCount: 0,
          returnedCount: 0,
          damagedCount: 0,
        },
        {
          id: 'ao-test-1-M',
          sku: 'TST-001-M',
          color: 'Crna',
          size: 'M',
          physicalStock: 3,
          reservedStock: 0,
          soldCount: 0,
          returnedCount: 0,
          damagedCount: 0,
        },
      ],
      internalNote: 'TAJNA INTERNA NAPOMENA',
      active: true,
      status: 'Aktivan',
      createdAt: '2026-11-01T10:00:00.000Z',
    };
    db.products.unshift(prod);
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    tempDir,
    engine,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test('End-to-end integration covers concurrency, idempotency, returns, security, RBAC, clearance, CSV, backup/restore, and SEO', async () => {
  const srv = await startTempServer();
  try {
    // 1. Setup first-run Owner account + verify setup locks permanently afterwards
    const setupRes = await fetch(`${srv.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'vlasnik', displayName: 'Vlasnik', password: 'tajna123' }),
    });
    assert.equal(setupRes.status, 201);
    const { token: ownerToken } = (await setupRes.json()) as { token: string };
    assert.ok(ownerToken);

    const secondSetupRes = await fetch(`${srv.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'napadac', password: 'hak123' }),
    });
    assert.equal(secondSetupRes.status, 403);

    // 2. Unauthenticated access to /api/admin/* must fail 401
    const unauthAdmin = await fetch(`${srv.baseUrl}/api/admin/bootstrap`);
    assert.equal(unauthAdmin.status, 401);

    // 3. Employee RBAC cannot access owner-only settings/delete
    await fetch(`${srv.baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        username: 'radnik1',
        displayName: 'Radnik',
        password: 'radnik123',
        role: 'zaposleni',
      }),
    });
    const empLogin = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'radnik1', password: 'radnik123' }),
    });
    const { token: empToken } = (await empLogin.json()) as { token: string };
    const empDeleteRes = await fetch(`${srv.baseUrl}/api/admin/products/ao-test-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.equal(empDeleteRes.status, 403);

    // 4. Public storefront & product detail MUST NOT leak purchasePrice, minAllowedPrice, internalNote
    const sfRes = await fetch(`${srv.baseUrl}/api/storefront`);
    const sfBody = await sfRes.text();
    assert.ok(!sfBody.includes('TAJNA INTERNA NAPOMENA'));
    assert.ok(!sfBody.includes('purchasePrice'));
    assert.ok(!sfBody.includes('minAllowedPrice'));

    // 5. Concurrent checkout on last 1 piece in size S -> 1 wins (201), 1 fails (409), stock never negative
    const orderPayload = {
      productId: 'ao-test-1',
      selectedSize: 'S',
      bundleQuantity: 1,
      customer: {
        fullName: 'Milica Petrović',
        street: 'Knez Mihailova 10',
        cityZip: 'Beograd 11000',
        phone: '0641234567',
      },
    };
    const [r1, r2] = await Promise.all([
      fetch(`${srv.baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderPayload, idempotencyKey: 'idem-concurrent-1' }),
      }),
      fetch(`${srv.baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderPayload, idempotencyKey: 'idem-concurrent-2' }),
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const winnerOrder = (await (r1.status === 201 ? r1.json() : r2.json())) as {
      order: { id: string };
    };

    // 6. Double-submit idempotency: same idempotencyKey returns existing order without extra deduction
    const replayRes = await fetch(`${srv.baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...orderPayload, idempotencyKey: 'idem-concurrent-1' }),
    });
    if (r1.status === 201) {
      assert.equal(replayRes.status, 200);
      const replayJson = (await replayRes.json()) as { idempotentReplay?: boolean };
      assert.equal(replayJson.idempotentReplay, true);
    }

    // 7. Privacy-safe order tracking rejects missing phoneLast4 and succeeds with last 4 digits
    const badTrack = await fetch(`${srv.baseUrl}/api/orders/track?code=${winnerOrder.order.id}`);
    assert.equal(badTrack.status, 400);
    const goodTrack = await fetch(
      `${srv.baseUrl}/api/orders/track?code=${winnerOrder.order.id}&phoneLast4=4567`,
    );
    assert.equal(goodTrack.status, 200);
    const trackText = await goodTrack.text();
    assert.ok(trackText.includes(winnerOrder.order.id));
    assert.ok(!trackText.includes('Knez Mihailova 10')); // Street stripped publicly!

    // 8. Cancel order -> stock restored once; repeated cancel does NOT double-restore
    await fetch(`${srv.baseUrl}/api/admin/orders/${winnerOrder.order.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: 'Otkazano' }),
    });
    await fetch(`${srv.baseUrl}/api/admin/orders/${winnerOrder.order.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: 'Otkazano' }),
    });
    const afterCancelProd = await (
      await fetch(`${srv.baseUrl}/api/products/ao-test-1`)
    ).json() as { product: { stockBySize: Record<string, number> } };
    assert.equal(afterCancelProd.product.stockBySize.S, 1);

    // 9. Manual Instagram order on M (qty 2) -> delivered -> partial return (1 good, 1 damaged)
    const manualRes = await fetch(`${srv.baseUrl}/api/admin/orders/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        items: [{ productId: 'ao-test-1', size: 'M', quantity: 2 }],
        source: 'Instagram',
        customer: {
          fullName: 'Jovana Ilić',
          street: 'Bulevar Oslobođenja 5',
          cityZip: 'Novi Sad 21000',
          phone: '0639998887',
        },
      }),
    });
    assert.equal(manualRes.status, 201);
    const manualJson = (await manualRes.json()) as { order: { id: string } };

    // Mark delivered
    await fetch(`${srv.baseUrl}/api/admin/orders/${manualJson.order.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: 'Isporučena' }),
    });

    // Return 1 undamaged + 1 damaged -> M had 3, sold 2 (=1), good +1 (=2), damaged excluded!
    const retRes = await fetch(
      `${srv.baseUrl}/api/admin/orders/${manualJson.order.id}/return`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          reason: 'Jedna haljina oštećena u transportu',
          refundAmountRsd: 1990,
          returnShippingCostRsd: 450,
          items: [
            { productId: 'ao-test-1', size: 'M', returnedQty: 1, damagedQty: 1 },
          ],
        }),
      },
    );
    assert.equal(retRes.status, 200);
    const retJson = (await retRes.json()) as {
      updatedProducts: { stockBySize: Record<string, number>; variants: { size: string; damagedCount: number }[] }[];
    };
    assert.equal(retJson.updatedProducts[0].stockBySize.M, 2);
    const mVar = retJson.updatedProducts[0].variants.find((v) => v.size === 'M');
    assert.equal(mVar?.damagedCount, 1);

    // 10. Clearance apply & rollback restores exact previous price
    const clrApply = await fetch(`${srv.baseUrl}/api/admin/clearance/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        label: 'Test sniženje',
        targetProductIds: ['ao-test-1'],
        mode: 'percent',
        value: 20,
        roundToEnding90: false,
      }),
    });
    assert.equal(clrApply.status, 200);
    const clrData = (await clrApply.json()) as { batch: { id: string } };
    const discountedProd = (await (
      await fetch(`${srv.baseUrl}/api/products/ao-test-1`)
    ).json()) as { product: { salePrice: number } };
    assert.equal(discountedProd.product.salePrice, 1592);

    await fetch(`${srv.baseUrl}/api/admin/clearance/rollback/${clrData.batch.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const restoredProd = (await (
      await fetch(`${srv.baseUrl}/api/products/ao-test-1`)
    ).json()) as { product: { salePrice: number } };
    assert.equal(restoredProd.product.salePrice, 1990);

    // 11. CSV Export (UTF-8 BOM bytes 0xEF 0xBB 0xBF) & CSV Import duplicate check
    const csvRes = await fetch(`${srv.baseUrl}/api/admin/export/products`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
    assert.deepEqual(Array.from(csvBytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
    const csvText = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes);
    assert.ok(csvText.startsWith('\uFEFF'));
    assert.ok(csvText.includes('Test Crna Haljina'));

    const importPreview = await fetch(`${srv.baseUrl}/api/admin/import/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        csvText: 'SKU,Naziv,Kategorija,Akcijska cena\nTST-001,Duplikat,Ostalo,1290',
        commit: false,
      }),
    });
    const importPreviewJson = (await importPreview.json()) as {
      preview: { duplicateReason?: string }[];
    };
    assert.ok(importPreviewJson.preview[0].duplicateReason);

    // 12. Backup create + restore
    const bkpRes = await fetch(`${srv.baseUrl}/api/admin/backups/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(bkpRes.status, 201);
    const { backup } = (await bkpRes.json()) as { backup: { fileName: string } };
    const restoreRes = await fetch(`${srv.baseUrl}/api/admin/backups/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ fileName: backup.fileName }),
    });
    assert.equal(restoreRes.status, 200);

    // 13. SEO routes & HTML metadata injection (/robots.txt, /sitemap.xml, JSON-LD, /admin noindex)
    const robots = await (await fetch(`${srv.baseUrl}/robots.txt`)).text();
    assert.ok(robots.includes('Disallow: /admin'));
    const sitemap = await (await fetch(`${srv.baseUrl}/sitemap.xml`)).text();
    assert.ok(sitemap.includes('/artikal/test-haljina-ao-test-1'));

    const sampleHtml =
      '<!doctype html><html><head><title>X</title><meta name="description" content="D"/></head><body></body></html>';
    const dbSnapshot = srv.engine.readDb();
    const productHtml = injectSeoIntoHtml(
      sampleHtml,
      '/artikal/test-haljina-ao-test-1',
      dbSnapshot,
      'https://modaplusoutlet.rs',
    );
    assert.ok(productHtml.includes('"@type":"Product"'));
    assert.ok(productHtml.includes('Test Crna Haljina'));
    const adminHtml = injectSeoIntoHtml(
      sampleHtml,
      '/admin',
      dbSnapshot,
      'https://modaplusoutlet.rs',
    );
    assert.ok(adminHtml.includes('noindex, nofollow'));

    // 14. Central brand/slogan/logo/phone/Viber updates via admin settings reflect in storefront & SEO
    const beforeOrdersCount = srv.engine.readDb().orders.length;
    const settingsPatchRes = await fetch(`${srv.baseUrl}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        brandName: 'MODA PLUS OUTLET TEST',
        brandSubtitle: 'Odličan stil. Još bolje cene.',
        secondarySlogan: 'Moda za celu porodicu po outlet cenama.',
        logoMonogram: 'MP',
        contactPhoneDisplay: '069 230 5074',
        contactViberNumber: '+381692305074',
      }),
    });
    assert.equal(settingsPatchRes.status, 200);
    const updatedSf = (await (await fetch(`${srv.baseUrl}/api/storefront`)).json()) as {
      settings: {
        brandName: string;
        brandSubtitle: string;
        secondarySlogan?: string;
        logoMonogram?: string;
        contactPhoneDisplay: string;
        contactViberNumber: string;
      };
    };
    assert.equal(updatedSf.settings.brandName, 'MODA PLUS OUTLET TEST');
    assert.equal(updatedSf.settings.contactPhoneDisplay, '069 230 5074');
    assert.equal(updatedSf.settings.contactViberNumber, '+381692305074');
    assert.equal(updatedSf.settings.logoMonogram, 'MP');
    assert.equal(srv.engine.readDb().orders.length, beforeOrdersCount);

    const updatedHomeHtml = injectSeoIntoHtml(
      sampleHtml,
      '/',
      srv.engine.readDb(),
      'https://modaplusoutlet.rs',
    );
    assert.ok(updatedHomeHtml.includes('MODA PLUS OUTLET TEST'));
    assert.ok(updatedHomeHtml.includes('069 230 5074'));
  } finally {
    await srv.close();
  }
});
