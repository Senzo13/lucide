import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import './Contact.css'

const schema = z.object({
  name: z.string().min(2, 'Au moins 2 caractères.'),
  email: z
    .string()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Adresse e-mail invalide.'),
  subject: z.string().min(1, 'Choisissez un sujet.'),
  message: z.string().min(12, 'Quelques mots de plus nous aident.'),
})

type FormValues = z.infer<typeof schema>

export default function Contact() {
  const root = useRef<HTMLElement>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', subject: site.contact.subjects[0], message: '' },
  })

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node)
  }, [])

  const onSubmit = async (values: FormValues) => {
    setSending(true)
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setSending(false)
    setSent(values.name.split(' ')[0] || values.name)
    reset()
  }

  return (
    <section id="contact" data-section className="section band contact section--hold" ref={root}>
      <div className="section__inner">
        <header className="s-head" data-reveal>
          <h2 className="u-mono contact__kicker">{site.contact.kicker}</h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">{site.contact.hours}</span>
        </header>

        <div className="contact__intro">
          <h3 className="contact__title" data-reveal>
            {site.contact.title}
          </h3>
          <p className="contact__lead" data-reveal>
            {site.contact.lead}
          </p>
        </div>

        <div className="contact__grid">
          <div className="contact__details" data-reveal>
            <div className="contact__detail">
              <span className="u-mono u-faint">PROJETS</span>
              <a className="contact__link" href={`mailto:${site.contact.email}`} data-cursor="hover">
                {site.contact.email}
              </a>
            </div>
            <div className="contact__detail">
              <span className="u-mono u-faint">CANDIDATURES</span>
              <a className="contact__link" href={`mailto:${site.contact.recruit}`} data-cursor="hover">
                {site.contact.recruit}
              </a>
            </div>
            <div className="contact__detail">
              <span className="u-mono u-faint">TÉLÉPHONE</span>
              <a
                className="contact__link"
                href={`tel:${site.contact.phone.replace(/\s/g, '')}`}
                data-cursor="hover"
              >
                {site.contact.phone}
              </a>
            </div>
            <div className="contact__detail">
              <span className="u-mono u-faint">RÉSEAUX</span>
              <ul className="contact__socials">
                {site.contact.socials.map((social) => (
                  <li key={social.label}>
                    <a
                      className="contact__link"
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      data-cursor="hover"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="contact__newsletter">
              <span className="u-mono contact__newsletter-title">{site.contact.newsletter.title}</span>
              <p className="contact__newsletter-body">{site.contact.newsletter.body}</p>
            </div>
          </div>

          <form className="contact__form" onSubmit={handleSubmit(onSubmit)} noValidate data-reveal>
            <div className="field">
              <label className="u-mono field__label" htmlFor="contact-name">
                NOM
              </label>
              <input
                id="contact-name"
                className="field__input"
                type="text"
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'contact-name-error' : undefined}
                {...register('name')}
              />
              {errors.name ? (
                <span className="u-mono field__error" id="contact-name-error" role="alert">
                  {errors.name.message}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label className="u-mono field__label" htmlFor="contact-email">
                E-MAIL
              </label>
              <input
                id="contact-email"
                className="field__input"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'contact-email-error' : undefined}
                {...register('email')}
              />
              {errors.email ? (
                <span className="u-mono field__error" id="contact-email-error" role="alert">
                  {errors.email.message}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label className="u-mono field__label" htmlFor="contact-subject">
                SUJET
              </label>
              <select
                id="contact-subject"
                className="field__input field__select"
                aria-invalid={Boolean(errors.subject)}
                {...register('subject')}
              >
                {site.contact.subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="u-mono field__label" htmlFor="contact-message">
                MESSAGE
              </label>
              <textarea
                id="contact-message"
                className="field__input field__textarea"
                rows={5}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={errors.message ? 'contact-message-error' : undefined}
                {...register('message')}
              />
              {errors.message ? (
                <span className="u-mono field__error" id="contact-message-error" role="alert">
                  {errors.message.message}
                </span>
              ) : null}
            </div>

            <div className="contact__form-foot">
              <button type="submit" className="u-pill contact__submit" disabled={sending} data-cursor="hover">
                <span className="u-pill__inner">
                  <span>{sending ? 'ENVOI…' : 'ENVOYER'}</span>
                  <span className="u-pill__hover" aria-hidden="true">
                    {sending ? 'ENVOI…' : 'ENVOYER'}
                  </span>
                </span>
              </button>
              <span className="u-mono u-faint" aria-live="polite">
                {sent ? `MERCI ${sent.toUpperCase()} — NOUS RÉPONDONS SOUS 7 JOURS.` : 'RÉPONSE SOUS 7 JOURS'}
              </span>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
