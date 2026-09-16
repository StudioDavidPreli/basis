// The Cadence gate in its Basis form (contracts/cadence-basis.md, "Lint").
//
// Two rules in one plugin. `jsx` reads JavaScript and TypeScript: a numeric
// literal in a timing position, or an easing that is not an identifier, is an
// error. `css` reads CSS Modules: a time, a cubic-bezier, or an easing keyword
// in a transition or animation declaration is an error unless it is a
// `var(--cadence-*)`.
//
// A target is not a timing position. `animate={{ opacity: 1 }}` is fine;
// `transition={{ duration: 0.3 }}` is not. The rule finds timing positions by
// finding transition-shaped objects: the value of a `transition` prop or
// property at any depth (so variants and nested `animate` objects count), and
// the options argument of an `animate(...)` call. Inside those, the value of
// every timing key is walked for numeric literals, so `durations.base * 2`
// fails on the 2, and `ease` must be an identifier or member expression, so
// `'easeOut'` and `[0.4, 0, 0.2, 1]` both fail.
//
// The rule cannot know that an identifier resolves to `useMotionTokens()`.
// That is the contract's job, and the code review's. What the rule guarantees
// is that no number and no curve is typed where a token should be read.

const TIMING_KEYS = new Set([
  'duration',
  'delay',
  'stiffness',
  'damping',
  'mass',
  'bounce',
  'repeatDelay',
  'staggerChildren',
  'delayChildren',
])

const TRANSITION_PROPS = new Set(['transition'])

function keyName(property) {
  if (!property.key) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal') return String(property.key.value)
  return null
}

// Every numeric literal reachable inside an expression, ignoring nothing:
// the point is that the number is typed here rather than read from a token.
function numericLiterals(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'Literal' && typeof node.value === 'number') {
    out.push(node)
    return out
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const child = node[key]
    if (Array.isArray(child)) child.forEach(c => numericLiterals(c, out))
    else if (child && typeof child.type === 'string') numericLiterals(child, out)
  }
  return out
}

function isTokenRead(node) {
  return node.type === 'Identifier' || node.type === 'MemberExpression'
}

function checkTransitionObject(context, object) {
  if (!object || object.type !== 'ObjectExpression') return
  for (const property of object.properties) {
    if (property.type !== 'Property') continue
    const name = keyName(property)
    if (name === 'ease') {
      if (!isTokenRead(property.value)) {
        context.report({
          node: property.value,
          messageId: 'easeLiteral',
        })
      }
      continue
    }
    if (TIMING_KEYS.has(name)) {
      for (const literal of numericLiterals(property.value)) {
        context.report({
          node: literal,
          messageId: 'timingLiteral',
          data: { key: name, value: String(literal.value) },
        })
      }
    }
  }
}

const jsx = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'every animation timing value is read from Cadence tokens, never typed in place',
    },
    messages: {
      timingLiteral:
        '`{{key}}: {{value}}` is a typed animation value. Read it from useMotionTokens() (durations, delays, spring) instead.',
      easeLiteral:
        'ease must be a token read (easings.standard, easings.enter, …), not a string or an array typed in place.',
    },
    schema: [],
  },
  create(context) {
    return {
      // <motion.div transition={{ ... }}>
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !TRANSITION_PROPS.has(node.name.name)) return
        if (node.value && node.value.type === 'JSXExpressionContainer') {
          checkTransitionObject(context, node.value.expression)
        }
      },
      // { transition: { ... } } anywhere: variants, nested animate objects,
      // exit objects, an object handed to a prop through a variable.
      Property(node) {
        if (keyName(node) === 'transition') checkTransitionObject(context, node.value)
      },
      // animate(target, values, { duration: 0.3 }) and animate(value, target, { ... })
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'animate') return
        const options = node.arguments[2] ?? null
        checkTransitionObject(context, options)
      },
    }
  },
}

// ── CSS ────────────────────────────────────────────────────────────────────

const CSS_PROPERTIES = new Set([
  'transition',
  'transition-duration',
  'transition-delay',
  'transition-timing-function',
  'animation',
  'animation-duration',
  'animation-delay',
  'animation-timing-function',
])

const EASING_KEYWORDS = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
])

const EASING_FUNCTIONS = new Set(['cubic-bezier', 'steps', 'linear'])

function children(node) {
  const c = node.children
  if (!c) return []
  return Array.isArray(c) ? c : c.toArray()
}

function walkValue(context, node) {
  for (const child of children(node)) {
    switch (child.type) {
      case 'Dimension':
        if (child.unit === 's' || child.unit === 'ms') {
          context.report({ loc: child.loc, messageId: 'time', data: { value: `${child.value}${child.unit}` } })
        }
        break
      case 'Identifier':
        if (EASING_KEYWORDS.has(child.name)) {
          context.report({ loc: child.loc, messageId: 'easing', data: { value: child.name } })
        }
        break
      case 'Function':
        if (EASING_FUNCTIONS.has(child.name)) {
          context.report({ loc: child.loc, messageId: 'easing', data: { value: `${child.name}()` } })
        } else if (child.name === 'var') {
          const first = children(child)[0]
          const name = first && first.type === 'Identifier' ? first.name : ''
          if (!name.startsWith('--cadence-')) {
            context.report({ loc: child.loc, messageId: 'foreignVar', data: { value: name } })
          }
        } else {
          walkValue(context, child)
        }
        break
      default:
        if (child.children) walkValue(context, child)
    }
  }
}

const css = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'transition and animation declarations read Cadence custom properties, never a typed time or curve',
    },
    messages: {
      time: '`{{value}}` is a typed time. Use var(--cadence-duration-*) or var(--cadence-delay-*).',
      easing: '`{{value}}` is a typed curve. Use var(--cadence-ease-*).',
      foreignVar:
        '`var({{value}})` is not a Cadence token. Only --cadence-* properties carry motion here.',
    },
    schema: [],
  },
  create(context) {
    return {
      Declaration(node) {
        if (!CSS_PROPERTIES.has(node.property)) return
        if (node.value) walkValue(context, node.value)
      },
    }
  },
}

const plugin = {
  meta: { name: 'no-inline-motion', version: '1.0.0' },
  rules: { jsx, css },
}

export default plugin
