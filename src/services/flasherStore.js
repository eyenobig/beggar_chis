import { openUrl } from '@tauri-apps/plugin-opener'
import { apiUrl } from '../config/api'
import { inTauri } from './cfb'
import {
  LEXICAL_FORMAT,
  normalizeLexicalContent,
  richParagraphLexical,
  textToLexical,
} from './lexicalRichText'

const STOREFRONT_ORIGIN = 'https://www.gbmake.com'
const ASSETS_ORIGIN = 'https://assets.gbmake.com'
const PRODUCT_HANDLE_RE = /^[a-z0-9][a-z0-9-]*$/
const ALLOWED_IMAGE_HOSTS = new Set(['assets.gbmake.com', 'www.gbmake.com', 'payload.gbmake.com'])
/** Payload/Medusa 商品封面常落在 Cloudflare R2 公共桶（pub-*.r2.dev） */
const R2_PUBLIC_HOST_RE = /^pub-[a-f0-9]+\.r2\.dev$/i

export const FLASHER_STORE_LANDING_URL = `${STOREFRONT_ORIGIN}/us/store`
/** GBMake 站点首页（抽屉右上角外链） */
export const GBMAKE_HOME_URL = `${STOREFRONT_ORIGIN}/us`

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isAllowedImageHost(hostname) {
  return ALLOWED_IMAGE_HOSTS.has(hostname) || R2_PUBLIC_HOST_RE.test(hostname)
}

function clampDisplayLimit(value) {
  if (typeof value === 'number' && value > 0) return Math.min(12, Math.floor(value))
  if (value == null) return 4
  return 4
}

/** CMS / seed：`2` | `3`（或字符串）；非法或缺省 → 3（与 flatten API 一致）。 */
function normalizeColumns(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return n === 2 ? 2 : 3
}

function fisherYatesShuffle(items) {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function assetCover(path) {
  return `${ASSETS_ORIGIN}/products/${path}`
}

function normalizeFeatureTags(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => (typeof row === 'string' ? row : row?.tag))
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 6)
}

/** 展开 Payload relationship / 嵌套商品对象。 */
function unwrapProduct(product) {
  if (!product || typeof product !== 'object') return null
  if (product.value && typeof product.value === 'object') return product.value
  if (product.doc && typeof product.doc === 'object') return product.doc
  return product
}

function pickImageUrl(product) {
  const candidates = [
    product?.thumbnail,
    product?.image,
    product?.cover,
    product?.coverImage,
    product?.media?.url,
    product?.media?.src,
    typeof product?.image === 'object' ? (product.image.url || product.image.src) : null,
  ]
  for (const raw of candidates) {
    const url = cleanText(raw)
    if (!url) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') continue
      if (!isAllowedImageHost(parsed.hostname)) continue
      return parsed.toString()
    } catch {
      /* ignore invalid */
    }
  }
  return ''
}

function normalizeProduct(product) {
  const doc = unwrapProduct(product)
  if (!doc) return null
  const handle = cleanText(doc.handle || doc.seedId || product?.handle || product?.seedId).toLowerCase()
  if (!PRODUCT_HANDLE_RE.test(handle)) return null
  const title = cleanText(doc.title || doc.simpleName) || handle
  // 与 storefront 一致：eyebrow 只用 subtitle，不用长 description
  const subtitle = cleanText(doc.subtitle)
  return {
    id: cleanText(doc.id) || handle,
    handle,
    seedId: cleanText(doc.seedId || handle).toLowerCase() || handle,
    title,
    subtitle,
    image: pickImageUrl(doc) || pickImageUrl(product),
    preorder: product?.relationTo === 'preorder-products' || doc?.relationTo === 'preorder-products',
    url: `${STOREFRONT_ORIGIN}/us/products/${encodeURIComponent(handle)}`,
  }
}

function normalizeList(list, index) {
  const products = Array.isArray(list?.products)
    ? list.products.map(normalizeProduct).filter(Boolean)
    : []
  if (!products.length) return null

  const ordered = list?.randomOrder ? fisherYatesShuffle(products) : products
  const displayLimit = clampDisplayLimit(list?.displayLimit)
  const columns = normalizeColumns(list?.columns)

  return {
    id: cleanText(list?.id) || `list-${index}`,
    title: cleanText(list?.title) || `List ${index + 1}`,
    // 保留 Lexical 对象或纯字符串，供 UiLexical 渲染（不再压成纯文本）
    subtitle: normalizeLexicalContent(list?.subtitle),
    featureTags: normalizeFeatureTags(list?.featureTags),
    displayLimit,
    columns,
    preorder: Boolean(list?.preorder),
    randomOrder: Boolean(list?.randomOrder),
    products: ordered.slice(0, displayLimit),
  }
}

/**
 * API 不可用时的离线轨：顺序对齐
 * `gb-product/data/flasher-seeds/default.json`（6 组）；subtitle 用 Lexical 结构。
 */
export const FLASHER_STORE_FALLBACK_LISTS = Object.freeze([
  {
    title: 'beggar_chis — Software Exclusive Burner',
    subtitle: richParagraphLexical([
      "The only burner for GBMake's beggar_chis site software (",
      { text: '这个烧录软件', format: LEXICAL_FORMAT.BOLD },
      '). USB to PC + in-browser burn.',
    ]),
    featureTags: ['Software exclusive', 'In-browser burn'],
    displayLimit: 4,
    columns: 2,
    products: [
      {
        handle: 'chisflashburner',
        title: 'ChisFlash Burner',
        subtitle: 'USB + GBMake / SkyEmu',
        thumbnail: assetCover('batch-04/Burner/chisflashburner/cover/chisflash.webp'),
      },
    ],
  },
  {
    title: 'Flash Cartridges — Pick Your Hardware',
    subtitle: textToLexical(
      'GB / GBC / GBA flash carts for your ROM. Choose a burner below that matches how you want to write.',
    ),
    featureTags: ['GB / GBC / GBA', 'Flashable carts'],
    displayLimit: 4,
    columns: 2,
    products: [
      {
        handle: 'cartridge-gba',
        title: 'GBA Flash Cartridge',
        subtitle: 'GBA',
        thumbnail: assetCover('batch-04/Cartridge/cartridge-gba/cover/gba.png'),
      },
      {
        handle: 'cartridge-gb-gbc',
        title: 'GB / GBC Flash Cartridge',
        subtitle: 'GB · GBC',
        thumbnail: assetCover('batch-04/Cartridge/cartridge-gb-gbc/cover/gb.png'),
      },
    ],
  },
  {
    title: 'Custom Stickers — Finish the Cart',
    subtitle: textToLexical(
      'Design labels in the A4 sheet editor for batch printing, or order a single custom cartridge sticker.',
    ),
    featureTags: ['A4 sheet', 'Single sticker'],
    displayLimit: 4,
    columns: 3,
    products: [
      {
        handle: 'custom-sticker',
        title: 'Custom Sticker (A4)',
        subtitle: 'A4 sheet',
        thumbnail: assetCover('batch-04/Sticker/custom-sticker/cover/sticker.png'),
      },
      {
        handle: 'custom-sticker-single',
        title: 'Custom Sticker (Single)',
        subtitle: 'Single',
        thumbnail: assetCover('batch-04/Sticker/custom-sticker-single/cover/gba_cartridge_label.png'),
      },
    ],
  },
  {
    title: 'Shells — Cartridge Housings',
    subtitle: textToLexical(
      'Replacement cartridge shells for GB, GBC, and GBA flash carts — many colors to finish your build.',
    ),
    featureTags: ['GB / GBC / GBA', 'Multi-color'],
    displayLimit: 4,
    columns: 3,
    products: [
      {
        handle: 'cartridge-shell-gba',
        title: 'GBA Shell',
        subtitle: 'GBA',
        thumbnail: assetCover('batch-01/Shell/cartridge-shell-gba/cover/gba.png'),
      },
      {
        handle: 'cartridge-shell-gb',
        title: 'GB Shell',
        subtitle: 'GB',
        thumbnail: assetCover('batch-01/Shell/cartridge-shell-gb/cover/gb.png'),
      },
      {
        handle: 'cartridge-shell-gbc',
        title: 'GBC Shell',
        subtitle: 'GBC',
        thumbnail: assetCover('batch-01/Shell/cartridge-shell-gbc/cover/gbc.png'),
      },
    ],
  },
  {
    title: 'ChisLink — WiFi Flashing',
    subtitle: textToLexical(
      'Flash cartridges over WiFi via the GBA Link Port — no PC cable required.',
    ),
    featureTags: ['WiFi flash', 'GBA Link Port'],
    displayLimit: 4,
    columns: 2,
    products: [
      {
        handle: 'chislink',
        title: 'ChisLink',
        subtitle: 'WiFi · Link Port',
        thumbnail: assetCover('batch-04/Burner/chislink/cover/chislink.webp'),
      },
    ],
  },
  {
    title: 'GBFlash — FlashGBX',
    subtitle: richParagraphLexical([
      'Classic USB-C reader/writer. Use ',
      { text: 'FlashGBX', format: LEXICAL_FORMAT.BOLD },
      ' on Windows, macOS, or Linux.',
    ]),
    featureTags: ['USB-C', 'FlashGBX'],
    displayLimit: 4,
    columns: 2,
    products: [
      {
        handle: 'gbflash',
        title: 'GBFlash Burner',
        subtitle: 'USB-C · FlashGBX',
        thumbnail: assetCover('batch-04/Burner/gbflash/cover/gbflash.webp'),
      },
    ],
  },
].map((list, index) => normalizeList(list, index)).filter(Boolean))

/** 从 CMS global 读取推荐；subtitle 保持 Lexical / string，不做纯文本压平。 */
export async function fetchFlasherStoreRecommendations({ signal } = {}) {
  const response = await fetch(apiUrl('/api/flasher-recommendations'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload?.enabled || !Array.isArray(payload.lists)) return []

  return payload.lists
    .map((list, index) => normalizeList(list, index))
    .filter(Boolean)
}

/** 仅允许打开 GBMake HTTPS storefront（含 CMS 富文本链接的 /us/* 路径）。 */
export async function openFlasherStoreUrl(url) {
  const parsed = new URL(String(url || ''))
  if (parsed.origin !== STOREFRONT_ORIGIN) throw new Error('不允许打开非 GBMake 商店地址')
  if (parsed.protocol !== 'https:') throw new Error('仅允许 HTTPS')
  if (!/^\/us(?:\/.*)?$/.test(parsed.pathname)) {
    throw new Error('无效的 GBMake 商店路径')
  }
  if (inTauri) {
    await openUrl(parsed.toString())
  } else {
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
  }
}
