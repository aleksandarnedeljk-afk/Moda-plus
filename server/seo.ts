import { getProductPath, getTotalStock, isProductPubliclyActive } from '../src/utils/storeLogic';
import type { FullStoreDatabase } from './types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateRobotsTxt(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /pracenje',
    '',
    `Sitemap: ${cleanBase}/sitemap.xml`,
    '',
  ].join('\n');
}

export function generateSitemapXml(db: FullStoreDatabase, baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    {
      loc: `${cleanBase}/`,
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: 'daily',
      priority: '1.0',
    },
  ];

  for (const page of db.legalPages) {
    urls.push({
      loc: `${cleanBase}/${page.slug}`,
      lastmod: (page.updatedAt || new Date().toISOString()).slice(0, 10),
      changefreq: 'monthly',
      priority: '0.4',
    });
  }

  for (const p of db.products) {
    if (!isProductPubliclyActive(p)) continue;
    urls.push({
      loc: `${cleanBase}${getProductPath(p)}`,
      lastmod: (p.updatedAt || p.createdAt).slice(0, 10),
      changefreq: 'daily',
      priority: getTotalStock(p.stockBySize, p.variants) > 0 ? '0.8' : '0.5',
    });
  }

  const entries = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function injectSeoIntoHtml(
  html: string,
  reqUrl: string,
  db: FullStoreDatabase,
  baseUrl: string,
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const [rawPath, rawSearch] = reqUrl.split('?');
  const pathname = rawPath || '/';
  const brandName = db.settings.brandName || 'MODA PLUS OUTLET';
  const mainSlogan = db.settings.brandSubtitle || 'Odličan stil. Još bolje cene.';
  const secondarySlogan =
    db.settings.secondarySlogan || 'Moda za celu porodicu po outlet cenama.';
  const heroTitle = db.settings.heroTitle || 'Velika rasprodaja zaliha';

  let title = `${brandName} — ${heroTitle} | ${mainSlogan}`;
  let description = `${mainSlogan} ${secondarySlogan} ${heroTitle} uz plaćanje pouzećem i brzu dostavu širom Srbije. Tel/Viber: ${db.settings.contactPhoneDisplay}.`;
  let canonicalUrl = `${cleanBase}${pathname === '/' ? '/' : pathname}`;
  let ogType = 'website';
  let ogImage = db.settings.heroImageUrl.startsWith('http')
    ? db.settings.heroImageUrl
    : `${cleanBase}${db.settings.heroImageUrl}`;
  let robotsContent = 'index, follow';
  let jsonLd: Record<string, unknown> | null = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: brandName,
    description: `${mainSlogan} ${secondarySlogan}`,
    url: cleanBase,
    telephone: db.settings.contactPhoneDisplay,
    email: db.settings.contactEmail,
  };

  if (pathname.startsWith('/admin') || pathname.startsWith('/pracenje')) {
    robotsContent = 'noindex, nofollow';
    title = pathname.startsWith('/admin')
      ? `${brandName} — Admin`
      : `${brandName} — Praćenje pošiljke`;
    jsonLd = null;
  } else if (rawSearch && rawSearch.length > 0 && pathname === '/') {
    // Prevent search/filter crawl bloat while keeping canonical pointing to /
    robotsContent = 'noindex, follow';
    canonicalUrl = `${cleanBase}/`;
  } else if (pathname.startsWith('/artikal/')) {
    const slugOrId = decodeURIComponent(pathname.replace('/artikal/', '').split('/')[0]);
    const product = db.products.find(
      (p) =>
        p.slug === slugOrId ||
        p.id === slugOrId ||
        slugOrId.endsWith(`-${p.id}`) ||
        getProductPath(p) === `/artikal/${slugOrId}`,
    );

    if (product && isProductPubliclyActive(product)) {
      const totalAvail = getTotalStock(product.stockBySize, product.variants);
      title = product.seoTitle || `${product.title} | ${brandName}`;
      description =
        product.seoDescription ||
        `${product.title} — ${product.salePrice} RSD (${product.materialNote}). Brza dostava i plaćanje pouzećem.`;
      canonicalUrl = `${cleanBase}${getProductPath(product)}`;
      ogType = 'product';
      if (product.imageUrl && !product.imageUrl.startsWith('data:')) {
        ogImage = product.imageUrl.startsWith('http')
          ? product.imageUrl
          : `${cleanBase}${product.imageUrl}`;
      }
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Početna', item: `${cleanBase}/` },
              {
                '@type': 'ListItem',
                position: 2,
                name: product.category,
                item: `${cleanBase}/?kategorija=${encodeURIComponent(product.category)}`,
              },
              { '@type': 'ListItem', position: 3, name: product.title, item: canonicalUrl },
            ],
          },
          {
            '@type': 'Product',
            name: product.title,
            sku: product.sku || product.id,
            description: product.description,
            image: ogImage,
            ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
            offers: {
              '@type': 'Offer',
              url: canonicalUrl,
              priceCurrency: 'RSD',
              price: String(product.salePrice),
              availability:
                totalAvail > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              itemCondition: 'https://schema.org/NewCondition',
            },
          },
        ],
      };
    } else {
      robotsContent = 'noindex, follow';
    }
  } else {
    const slug = pathname.replace(/^\//, '').split('/')[0];
    const legal = db.legalPages.find((l) => l.slug === slug);
    if (legal) {
      title = `${legal.title} | ${brandName}`;
      description = legal.content.slice(0, 155);
      canonicalUrl = `${cleanBase}/${legal.slug}`;
    }
  }

  const gscMeta = db.settings.gscVerificationTag
    ? `<meta name="google-site-verification" content="${escapeHtmlAttr(db.settings.gscVerificationTag)}" />`
    : '';

  const headInject = [
    `<meta name="robots" content="${robotsContent}" />`,
    `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`,
    gscMeta,
    jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(title)}</title>`);
  result = result.replace(
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${escapeHtmlAttr(description)}" />`,
  );
  result = result.replace(
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`,
  );
  result = result.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`,
  );
  result = result.replace('</head>', `    ${headInject}\n  </head>`);
  return result;
}
