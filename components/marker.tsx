// An entity's fixed marker in its fixed color: the second cue beside color
// (decisions/2026-09-16-passbook-visual-language.md). Eight shapes, drawn
// as one small SVG so the legend, the row swatch, and the chart endpoint
// draw the same glyph. The color has one value per stock; both ride on the
// element as custom properties and styles/paper.css picks by theme.
// Decorative where the name sits beside it.

import type { CSSProperties } from 'react'

const SIZE = 10

export type EntityColors = { light: string; dark: string }

export function entityStyle(colors: EntityColors): CSSProperties {
  return { '--entity-light': colors.light, '--entity-dark': colors.dark } as CSSProperties
}

export function Marker({ shape, colors, size = SIZE }: { shape: string; colors: EntityColors; size?: number }) {
  const c = size / 2
  const r = size / 2 - 1
  const fill = 'var(--entity-color)'
  let body: React.ReactNode
  switch (shape) {
    case 'square':
      body = <rect x={1} y={1} width={size - 2} height={size - 2} fill={fill} />
      break
    case 'triangle':
      body = <polygon points={`${c},1 ${size - 1},${size - 1} 1,${size - 1}`} fill={fill} />
      break
    case 'diamond':
      body = <polygon points={`${c},0.5 ${size - 0.5},${c} ${c},${size - 0.5} 0.5,${c}`} fill={fill} />
      break
    case 'cross':
      body = <path d={`M2 2 L${size - 2} ${size - 2} M${size - 2} 2 L2 ${size - 2}`} stroke={fill} strokeWidth={2} />
      break
    case 'plus':
      body = <path d={`M${c} 1 V${size - 1} M1 ${c} H${size - 1}`} stroke={fill} strokeWidth={2} />
      break
    case 'star':
      body = (
        <path
          d={`M${c} 0.5 L${c + 1.6} ${c - 1.4} L${size - 0.5} ${c - 1} L${c + 2.4} ${c + 1.2} L${c + 3.2} ${size - 0.5} L${c} ${c + 2.2} L${c - 3.2} ${size - 0.5} L${c - 2.4} ${c + 1.2} L0.5 ${c - 1} L${c - 1.6} ${c - 1.4} Z`}
          fill={fill}
        />
      )
      break
    case 'ring':
      body = <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke={fill} strokeWidth={2} />
      break
    default:
      body = <circle cx={c} cy={c} r={r} fill={fill} />
  }
  return (
    <svg className="entity" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" style={entityStyle(colors)}>
      {body}
    </svg>
  )
}
