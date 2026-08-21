import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Button, PageHeader, Screen, Segmented } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import { Breakdown } from '../components/Breakdown'
import { downloadCollection } from '../lib/export'
import { money } from '../lib/money'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import { useToast } from '../lib/toast'
import type { DeviceSession, Health, Invite, Pack, RegistrationPolicy } from '../lib/types'

const MIN_PASSWORD = 10

/* ── The log book ──────────────────────────────────────────────────────────────────
   A record of the voyage rather than a settings page. The numbers come first — what
   is aboard, and how far along the chart it goes — and the machinery of the account
   sits under them where it belongs.

   The handoff sketches a list of three rows: export, legal notices, help. All three
   lead somewhere now. Everything below the fold — password, sign-out, deletion — is
   machinery the handoff never drew, so it follows the same rails rather than
   inventing its own.  */

export function Account() {
  const { user, signOut, setUser } = useAuth()
  const { stats, entries } = useCollection()
  const { language, setLanguage } = useLanguage()
  const { show } = useToast()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null)
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [minting, setMinting] = useState(false)
  // Shown once, exactly as the server hands it out: minting again, or leaving the
  // screen, drops it for good, the same way the server itself never says it twice.
  const [mintedCode, setMintedCode] = useState<string | null>(null)
  const [revokingInvite, setRevokingInvite] = useState<number | null>(null)

  useEffect(() => {
    api.packs().then(setPacks).catch(() => {})
    api.health().then(setHealth).catch(() => {})
    api.sessions().then(setSessions).catch(() => {})
    api.registrationPolicy().then(setPolicy).catch(() => {})
    api.invites().then(setInvites).catch(() => {})
  }, [])

  const revokeSession = async (id: number) => {
    setRevoking(id)
    try {
      await api.revokeSession(id)
      setSessions((current) => current?.filter((session) => session.id !== id) ?? null)
    } catch {
      show("La déconnexion de cet appareil n'a pas abouti.")
    } finally {
      setRevoking(null)
    }
  }

  const mintInvite = async () => {
    setMinting(true)
    try {
      const invite = await api.createInvite()
      setMintedCode(invite.code ?? null)
      setInvites((current) => [invite, ...(current ?? [])])
    } catch {
      show("La création du code n'a pas abouti.")
    } finally {
      setMinting(false)
    }
  }

  const revokeInvite = async (id: number) => {
    setRevokingInvite(id)
    try {
      await api.revokeInvite(id)
      setInvites((current) => current?.filter((invite) => invite.id !== id) ?? null)
    } catch {
      show("L'annulation n'a pas abouti.")
    } finally {
      setRevokingInvite(null)
    }
  }

  /* Both editions, because this is the whole binder and not the one being browsed. */
  const catalogue = useMemo(
    () => Object.values(health?.catalogue ?? {}).reduce((sum, n) => sum + n, 0),
    [health],
  )
  const started = (packs ?? []).filter((pack) => pack.owned_count > 0).length
  const distinct = stats?.distinct_cards ?? 0
  const share = catalogue > 0 ? (distinct / catalogue) * 100 : null

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      // The server revokes every other session on a password change, so say so —
      // otherwise the other device silently signing out looks like a bug.
      show('Mot de passe changé. Les autres appareils sont déconnectés.')
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? 'Mot de passe actuel incorrect.'
          : "Le changement n'a pas abouti.",
      )
    } finally {
      setBusy(false)
    }
  }

  const trimmedName = displayName.trim()
  const nameChanged = trimmedName.length > 0 && trimmedName !== (user?.display_name ?? '')

  const saveDisplayName = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!nameChanged) return
    setSavingName(true)
    try {
      setUser(await api.updateProfile({ display_name: trimmedName }))
      show('Nom affiché mis à jour.')
    } catch {
      show("La mise à jour n'a pas abouti.")
    } finally {
      setSavingName(false)
    }
  }

  const removeAccount = async () => {
    setBusy(true)
    try {
      await api.deleteAccount()
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 px-3 pt-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Revenir"
          className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
      </header>

      {/* A log book, not a settings page — so it is titled as one, and the account it
          belongs to is the line above rather than the heading. */}
      <PageHeader title="Carnet de bord" meta={user?.email} />

      {/* Four quarters. A 1px rail between them rather than four cards: it is one
          reading of one collection, not four separate facts. */}
      <dl className="grid grid-cols-2 gap-px" style={{ background: 'var(--surface-rail)' }}>
        <Quarter value={stats?.total_quantity ?? 0} label="cartes rangées" />
        <Quarter value={distinct} label="références" />
        <Quarter value={started} label={`extension${started > 1 ? 's' : ''} entamée${started > 1 ? 's' : ''}`} />
        <Quarter
          value={share === null ? '—' : `${share.toFixed(1).replace('.', ',')} %`}
          label="du catalogue"
        />
      </dl>

      {stats && (stats.market_priced > 0 || stats.acquisition_total > 0) && (
        <section className="pt-8">
          <p className="t-eyebrow px-5 pb-2.5">Valeur</p>
          <dl className="grid grid-cols-2 gap-px" style={{ background: 'var(--surface-rail)' }}>
            <Quarter value={money(stats.market_total)} label="valeur estimée" />
            <Quarter value={money(stats.acquisition_total)} label="prix payé" />
          </dl>
          {/* Where the number comes from, in the place where it could mislead. The
              feed is the American market and it does not cover everything, so the
              screen says both rather than letting a total pass for an appraisal. */}
          <p className="px-5 pt-3 text-sm text-[var(--text-secondary)]">
            {stats.market_priced === 0
              ? "Aucune carte de ta collection n'est cotée pour l'instant."
              : `Cotées : ${stats.market_priced} carte${stats.market_priced > 1 ? 's' : ''} sur ${stats.total_quantity}. Prix du marché américain (TCGplayer), convertis en euros au taux du jour — pas des prix Cardmarket.`}
          </p>
        </section>
      )}

      {stats && <Breakdown stats={stats} />}

      {/* Chosen once at sign-up (optional there, defaulting to the email's local
          part) and never editable since — the server has taken a PATCH here all
          along, nothing stood in front of it. */}
      <form onSubmit={saveDisplayName} className="px-5 pt-8">
        <p className="t-eyebrow pb-2.5">Nom affiché</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={displayName}
            maxLength={60}
            aria-label="Nom affiché"
            onChange={(event) => setDisplayName(event.target.value)}
            className="t-code min-h-[var(--touch)] w-full min-w-0 rounded-full px-4 outline-none"
            style={{ background: 'var(--surface-recessed)' }}
          />
          <Button type="submit" variant="quiet" disabled={!nameChanged || savingName}>
            {savingName ? 'Un instant…' : 'Enregistrer'}
          </Button>
        </div>
        {/* Not just a label for this screen: it is what a shared link's own page
            greets a stranger with -- "Collection de {owner_name}" on
            SharedCollection/SharedWishlist reads this exact field. */}
        <p className="pt-2.5 text-sm text-[var(--text-secondary)]">
          Le nom vu sur cet écran, et par qui ouvre un de tes liens de partage.
        </p>
      </form>

      {/* The default edition. It belongs here rather than in a settings screen that
          does not exist, and it is the account's setting now, not the session's. */}
      <section className="px-5 pt-8">
        <p className="t-eyebrow pb-2.5">Édition par défaut</p>
        <Segmented
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
          label="Édition par défaut"
        />
        {/* The setting names itself but does not explain itself: which edition is
            "default" only means something once you know what reads it. */}
        <p className="pt-2.5 text-sm text-[var(--text-secondary)]">
          Détermine l'édition proposée après un scan et à l'ouverture d'une recherche.
          Tu peux en changer à tout moment.
        </p>
      </section>

      {/* A log book you can take away. The handoff draws this as a list of three:
          export, legal notices, help. Two of them are real now. Help still leads
          nowhere and stays out — a row that does nothing is worse than a row that is
          absent. */}
      <div className="mt-8 border-t border-[rgba(243,230,203,.12)]">
        <Row
          disabled={entries.length === 0}
          onClick={() => {
            downloadCollection(entries)
            show(`${entries.length} lignes exportées`)
          }}
        >
          Exporter ma collection
        </Row>
        <Row onClick={() => navigate('/legal')}>Mentions légales</Row>
        <Row onClick={() => navigate('/help')}>Aide</Row>
      </div>

      <form onSubmit={changePassword} className="px-5 pt-8">
        <p className="t-eyebrow">Mot de passe</p>
        <label className="mt-3 block">
          <span className="t-code">Actuel</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 outline-none"
            style={{ background: 'var(--surface-recessed)' }}
          />
        </label>
        <label className="mt-3 block">
          <span className="t-code">Nouveau</span>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 outline-none"
            style={{ background: 'var(--surface-recessed)' }}
          />
        </label>
        {error && (
          <p role="alert" className="pt-3 text-sm text-ember-500">
            {error}
          </p>
        )}
        <div className="pt-4">
          <Button type="submit" variant="quiet" disabled={busy || next.length < MIN_PASSWORD}>
            Changer le mot de passe
          </Button>
        </div>
      </form>

      {sessions && sessions.length > 0 && (
        <section className="px-5 pt-8">
          <p className="t-eyebrow pb-2.5">Appareils connectés</p>
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-[14px] p-3"
                style={{ background: 'var(--surface-recessed)' }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {describeDevice(session.user_agent)}
                    {session.current && (
                      <span className="t-code pl-2 text-[var(--text-faint)]">Cet appareil</span>
                    )}
                  </p>
                  <p className="t-code pt-1 text-[var(--text-faint)]">
                    Actif depuis le {formatSessionDate(session.issued_at)}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    disabled={revoking === session.id}
                    onClick={() => revokeSession(session.id)}
                  >
                    Déconnecter
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {/* The current row has no button of its own on purpose: "Se déconnecter"
              just below already does exactly that, and a second control for the
              same action would just be two ways to ask the same question. */}
        </section>
      )}

      {/* Registration is invite-only by default, and until now the server was the
          only thing that could actually mint one -- create_invite and its two
          sibling endpoints (list, revoke) existed with no screen anywhere calling
          them, so the one way in for a second account was a code nobody had a way
          to generate. Hidden entirely outside 'invite' mode: a code means nothing
          in 'open' (the sign-up form has no field for one there) and nothing can
          be minted usefully in 'closed'. */}
      {policy?.mode === 'invite' && (
        <section className="px-5 pt-8">
          <p className="t-eyebrow pb-2.5">Inviter quelqu'un</p>
          <p className="pb-3 text-sm text-[var(--text-secondary)]">
            Un code se donne une fois, et une fois consommé, plus jamais.
          </p>

          {mintedCode ? (
            <div
              className="rounded-[14px] p-4"
              style={{ background: 'var(--surface-recessed)' }}
            >
              {/* Stored hashed server-side, so this is the only moment its plaintext
                  ever exists outside a memory nobody can read back later. */}
              <p className="t-code pb-2 text-[var(--text-faint)]">
                Note-le maintenant — il ne sera plus jamais affiché
              </p>
              <div className="flex items-center gap-2">
                <p className="t-numeral min-w-0 flex-1 truncate text-lg">{mintedCode}</p>
                <Button
                  variant="quiet"
                  onClick={() => {
                    navigator.clipboard.writeText(mintedCode).then(() => show('Code copié.'))
                  }}
                >
                  Copier
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" disabled={minting} onClick={mintInvite}>
              {minting ? 'Un instant…' : "Créer un code d'invitation"}
            </Button>
          )}

          {invites && invites.length > 0 && (
            <ul className="mt-4 space-y-2">
              {invites.map((invite) => {
                const expired = Boolean(
                  invite.expires_at && new Date(invite.expires_at) < new Date(),
                )
                return (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-3 rounded-[14px] p-3"
                    style={{ background: 'var(--surface-recessed)' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {invite.used_at ? 'Utilisée' : expired ? 'Expirée' : 'En attente'}
                        {invite.note && (
                          <span className="t-code pl-2 text-[var(--text-faint)]">
                            {invite.note}
                          </span>
                        )}
                      </p>
                      <p className="t-code pt-1 text-[var(--text-faint)]">
                        Créée le {formatSessionDate(invite.created_at)}
                      </p>
                    </div>
                    {!invite.used_at && (
                      <Button
                        variant="ghost"
                        disabled={revokingInvite === invite.id}
                        onClick={() => revokeInvite(invite.id)}
                      >
                        Annuler
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <div className="mx-5 mt-8 border-t border-[rgba(243,230,203,.12)] pt-6">
        <Button variant="quiet" full onClick={signOut}>
          Se déconnecter
        </Button>
      </div>

      <section className="mx-5 mt-10 mb-4 rounded-[14px] p-4"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(217,58,32,.32)' }}>
        <p className="t-eyebrow text-ember-500">Supprimer le compte</p>
        <p className="pt-1 text-sm text-[var(--text-secondary)]">
          Ta collection et ta wishlist sont supprimées avec le compte. Le catalogue des
          cartes n'est pas affecté. C'est définitif.
        </p>
        <div className="pt-4">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="destructive" onClick={removeAccount} disabled={busy}>
                Confirmer la suppression
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Supprimer mon compte
            </Button>
          )}
        </div>
      </section>
    </Screen>
  )
}

/* One row of the list, so the second one cannot drift from the first. The chevron is
   decorative — the label already says where it goes. */
function Row({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[var(--touch)] w-full items-center justify-between gap-3 border-b border-[rgba(243,230,203,.12)] px-5 py-4 text-left text-sm font-medium last:border-b-0 disabled:opacity-40"
    >
      {children}
      <span aria-hidden className="text-[var(--text-faint)]">
        ›
      </span>
    </button>
  )
}

/* A raw user_agent string is unreadable on a screen meant to help someone spot an
   unfamiliar device -- "Chrome sur Windows" answers the question this list
   exists for, the full string does not. Order matters within each guess: Edge's
   own UA also contains "Chrome/" and "Safari/", and Chrome on iOS is "CriOS"
   rather than "Chrome/", so the more specific tokens are checked first. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu'
  const os = userAgent.includes('iPhone')
    ? 'iPhone'
    : userAgent.includes('iPad')
      ? 'iPad'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('Macintosh')
          ? 'Mac'
          : userAgent.includes('Windows')
            ? 'Windows'
            : userAgent.includes('Linux')
              ? 'Linux'
              : null
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('CriOS')
      ? 'Chrome'
      : userAgent.includes('Chrome/')
        ? 'Chrome'
        : userAgent.includes('Firefox')
          ? 'Firefox'
          : userAgent.includes('Safari/')
            ? 'Safari'
            : null
  if (os && browser) return `${browser} sur ${os}`
  return os ?? browser ?? 'Navigateur inconnu'
}

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Quarter({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="px-5 py-5" style={{ background: 'var(--color-sea-900)' }}>
      <dd className="t-numeral text-[1.9rem]">
        {typeof value === 'number' ? value.toLocaleString('fr') : value}
      </dd>
      <dt className="t-code pt-2">{label}</dt>
    </div>
  )
}
