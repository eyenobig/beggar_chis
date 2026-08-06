/**
 * Payload Lexical 富文本工具（通用）。
 * Flasher CMS 字段实际启用：paragraph / bold / italic / link。
 */

const IS_BOLD = 1
const IS_ITALIC = 2
const IS_STRIKETHROUGH = 4
const IS_UNDERLINE = 8

export const LEXICAL_FORMAT = Object.freeze({
  BOLD: IS_BOLD,
  ITALIC: IS_ITALIC,
  STRIKETHROUGH: IS_STRIKETHROUGH,
  UNDERLINE: IS_UNDERLINE,
})

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function hasVisibleLexicalContent(children) {
  if (!Array.isArray(children) || !children.length) return false
  return children.some((node) => {
    if (!node || typeof node !== 'object') return false
    if (node.type === 'linebreak') return false
    if (node.type === 'text') return cleanText(node.text).length > 0
    if (node.type === 'link' || node.type === 'autolink') {
      return hasVisibleLexicalContent(node.children)
    }
    return hasVisibleLexicalContent(node.children)
  })
}

/** 取出 Lexical root；非法则 null。 */
export function getLexicalRoot(doc) {
  if (!doc || typeof doc !== 'object') return null
  if (doc.root && typeof doc.root === 'object' && doc.root.type === 'root') return doc.root
  if (doc.type === 'root') return doc
  return null
}

/**
 * 规范化富文本内容：
 * - string → 纯文本
 * - Lexical 对象 → `{ root }`
 * - 空 → null
 */
export function normalizeLexicalContent(content) {
  if (typeof content === 'string') {
    const text = cleanText(content)
    return text || null
  }
  const root = getLexicalRoot(content)
  if (!root) return null
  if (!hasVisibleLexicalContent(root.children)) return null
  return { root }
}

/** @deprecated 使用 normalizeLexicalContent */
export const normalizeListSubtitle = normalizeLexicalContent

/** 纯文本 → 单段 Lexical。 */
export function textToLexical(text) {
  const line = cleanText(text)
  if (!line) return null
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          children: [
            {
              text: line,
              type: 'text',
              format: 0,
              mode: 'normal',
              style: '',
              detail: 0,
              version: 1,
            },
          ],
        },
      ],
    },
  }
}

/** @deprecated 使用 textToLexical */
export const textToLexicalSubtitle = textToLexical

/** 多 text 片段拼一段（可带 format 位掩码）。 */
export function richParagraphLexical(parts) {
  const children = (parts || [])
    .map((part) => {
      if (typeof part === 'string') {
        if (!part) return null
        return {
          text: part,
          type: 'text',
          format: 0,
          mode: 'normal',
          style: '',
          detail: 0,
          version: 1,
        }
      }
      const text = typeof part?.text === 'string' ? part.text : ''
      if (!text) return null
      return {
        text,
        type: 'text',
        format: Number(part.format) || 0,
        mode: 'normal',
        style: '',
        detail: 0,
        version: 1,
      }
    })
    .filter(Boolean)

  if (!children.length) return null
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          children,
        },
      ],
    },
  }
}

/** @deprecated 使用 richParagraphLexical */
export const richParagraphSubtitle = richParagraphLexical

/** 从 link / autolink 节点取原始 href。 */
export function getLexicalLinkHref(node) {
  if (!node || typeof node !== 'object') return ''
  const fromFields = cleanText(node.fields?.url)
  const fromUrl = cleanText(node.url)
  if (fromUrl) return fromUrl
  if (fromFields) return fromFields
  if (node.fields?.linkType === 'internal') {
    const slug = cleanText(node.fields?.doc?.value?.slug || node.fields?.doc?.slug)
    if (slug) return slug.startsWith('/') ? slug : `/${slug}`
  }
  return ''
}

/**
 * 将 href 解析为 GBMake storefront HTTPS URL；非法返回 ''。
 * 供商店等场景传入 UiLexical 的 resolveHref。
 */
export function resolveGbmakeHref(href, {
  origin = 'https://www.gbmake.com',
  countryPrefix = '/us',
} = {}) {
  const raw = cleanText(href)
  if (!raw || raw === '#') return ''

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const parsed = new URL(raw)
      if (parsed.protocol !== 'https:') return ''
      if (parsed.origin !== origin) return ''
      return parsed.toString()
    }

    let path = raw
    if (!path.startsWith('/')) path = `/${path}`
    if (countryPrefix && !path.startsWith(countryPrefix)) {
      path = path === '/' ? countryPrefix : `${countryPrefix}${path}`
    }
    return new URL(path, origin).toString()
  } catch {
    return ''
  }
}

/** @deprecated 使用 resolveGbmakeHref */
export const resolveFlasherLinkHref = (href) => resolveGbmakeHref(href)

export const LEXICAL_STOREFRONT_ORIGIN = 'https://www.gbmake.com'
