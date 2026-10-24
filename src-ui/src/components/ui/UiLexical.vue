<!--
  通用 Payload Lexical 渲染：string | { root } → DOM。
  支持 paragraph / text(format) / link|autolink / linebreak；未知节点尽量展开 children。
  链接通过 resolveHref 校验，点击 emit navigate(safeUrl, rawHref)。
-->
<script>
import { h } from 'vue'
import {
  LEXICAL_FORMAT,
  getLexicalLinkHref,
  getLexicalRoot,
  hasVisibleLexicalContent,
} from '../../services/lexicalRichText'

function applyFormat(text, format, { strongClass, emClass }) {
  let node = text
  const mask = Number(format) || 0
  if (mask & LEXICAL_FORMAT.BOLD) {
    node = h('strong', strongClass ? { class: strongClass } : null, node)
  }
  if (mask & LEXICAL_FORMAT.ITALIC) {
    node = h('em', emClass ? { class: emClass } : null, node)
  }
  if (mask & LEXICAL_FORMAT.STRIKETHROUGH) {
    node = h('s', node)
  }
  if (mask & LEXICAL_FORMAT.UNDERLINE) {
    node = h('u', node)
  }
  return node
}

export default {
  name: 'UiLexical',
  inheritAttrs: false,
  props: {
    /** string 或 Lexical 文档 `{ root }` / root 节点 */
    content: {
      type: [String, Object],
      default: null,
    },
    /** 根容器 class */
    rootClass: {
      type: String,
      default: 'ui-lexical',
    },
    strongClass: {
      type: String,
      default: 'font-semibold',
    },
    emClass: {
      type: String,
      default: 'italic',
    },
    linkClass: {
      type: String,
      default:
        'font-medium text-sky-400/90 underline-offset-2 transition-colors hover:text-sky-300 hover:underline',
    },
    paragraphClass: {
      type: String,
      default: 'my-0 leading-relaxed',
    },
    /**
     * (rawHref) => safeHref | ''
     * 未传则使用原始 href（调用方应监听 navigate 自行校验）。
     */
    resolveHref: {
      type: Function,
      default: null,
    },
  },
  emits: ['navigate'],
  setup(props, { emit, attrs }) {
    function resolve(rawHref) {
      if (typeof props.resolveHref === 'function') {
        return props.resolveHref(rawHref) || ''
      }
      return typeof rawHref === 'string' ? rawHref.trim() : ''
    }

    function onLinkClick(event, rawHref) {
      event.preventDefault()
      event.stopPropagation()
      const safe = resolve(rawHref)
      emit('navigate', safe, rawHref)
    }

    function renderNodes(nodes) {
      if (!Array.isArray(nodes)) return []
      return nodes.map((node, index) => renderNode(node, index)).filter((n) => n != null)
    }

    function renderNode(node, key) {
      if (!node || typeof node !== 'object') return null
      const formatOpts = {
        strongClass: props.strongClass,
        emClass: props.emClass,
      }

      switch (node.type) {
        case 'root':
          return renderNodes(node.children)

        case 'paragraph': {
          if (!hasVisibleLexicalContent(node.children)) {
            return h('div', { key, class: 'h-2', 'aria-hidden': 'true' })
          }
          return h(
            'p',
            { key, class: props.paragraphClass },
            renderNodes(node.children),
          )
        }

        case 'link':
        case 'autolink': {
          const rawHref = getLexicalLinkHref(node)
          const safe = resolve(rawHref)
          return h(
            'a',
            {
              key,
              href: safe || '#',
              class: props.linkClass,
              onClick: (event) => onLinkClick(event, rawHref),
            },
            renderNodes(node.children),
          )
        }

        case 'text': {
          const raw = typeof node.text === 'string' ? node.text : ''
          if (!raw) return null
          return applyFormat(raw, node.format ?? 0, formatOpts)
        }

        case 'linebreak':
          return h('br', { key })

        default: {
          if (Array.isArray(node.children) && node.children.length) {
            return renderNodes(node.children)
          }
          if (typeof node.text === 'string' && node.text) {
            return applyFormat(node.text, node.format ?? 0, formatOpts)
          }
          return null
        }
      }
    }

    return () => {
      const content = props.content
      if (content == null || content === '') return null

      const rootClass = [props.rootClass, attrs.class].filter(Boolean)

      if (typeof content === 'string') {
        const text = content.trim()
        if (!text) return null
        return h('div', { class: rootClass }, [
          h('p', { class: props.paragraphClass }, text),
        ])
      }

      const root = getLexicalRoot(content)
      if (!root || !hasVisibleLexicalContent(root.children)) return null

      return h('div', { class: rootClass }, renderNodes(root.children))
    }
  },
}
</script>
