import { Fragment, type CSSProperties } from 'react'
import './WaveText.css'

type Props = {
  text: string
  className?: string
}

/**
 * Text that ripples when the element around it is hovered.
 *
 * Every letter is its own box and carries its index, so the CSS can stagger the
 * lift by `--i` and a wave travels through the phrase — out on the way in, back
 * on the way out. Words stay grouped (one nowrap box each) so a two-word title
 * still wraps between its words, never inside one.
 */
export default function WaveText({ text, className }: Props) {
  const words = text.split(' ')
  let index = 0

  return (
    <span className={className ? `wave ${className}` : 'wave'}>
      {words.map((word, wordIndex) => (
        <Fragment key={`${word}-${wordIndex}`}>
          <span className="wave__word">
            {Array.from(word).map((letter, letterIndex) => (
              <span
                key={letterIndex}
                className="wave__letter"
                style={{ '--i': index++ } as CSSProperties}
              >
                {letter}
              </span>
            ))}
          </span>
          {wordIndex < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  )
}
