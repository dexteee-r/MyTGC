import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { PageHeader, Screen } from '../components/ui'

/* ── Mentions légales ──────────────────────────────────────────────────────────────
   Reachable signed out as well as signed in, which is the whole point: the sign-in
   screen is the public face of the instance, and a legal notice nobody can read
   without an account is not a notice. App.tsx routes it in both states.

   Everything here is checked against the code rather than written from a template.
   The claim that deleting an account deletes the search history was false when this
   page was drafted — search_history had no foreign key to cascade from — so the
   endpoint was fixed first. If a statement below stops being true, it is a bug in
   the statement or in the code, never a detail.                                     */

export function Legal() {
  const navigate = useNavigate()

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

      <PageHeader title="Mentions légales" meta="MyTCG" />

      <div className="px-5 pb-4">
        <Section title="Éditeur et hébergement">
          <P>
            MyTCG est un projet personnel, sans but lucratif, sans publicité et sans
            vente.
          </P>
          <P>
            Éditeur et hébergeur : <strong>Mohamed Mokhtar El Mazani</strong>.
            <br />
            Contact : <Mail />
          </P>
          <P>
            Le service tourne sur une machine personnelle, en France. Il n'y a pas
            d'hébergeur tiers.
          </P>
        </Section>

        <Section title="Ce que l'application enregistre">
          <P>
            <Term>Ton compte</Term> : ton adresse e-mail, ton nom affiché si tu en as
            mis un, ton mot de passe haché en Argon2id — jamais en clair, et le hachage
            ne se relit pas —, ton édition par défaut, le nombre de cartes par ligne, la
            date de création du compte et celle de ta dernière connexion.
          </P>
          <P>
            <Term>Tes sessions</Term> : un jeton de renouvellement par appareil
            connecté, stocké haché lui aussi, avec le navigateur qui l'a demandé et ses
            dates d'émission et d'expiration.
          </P>
          <P>
            <Term>Ce que tu accumules</Term> : ta collection (la carte, la quantité,
            l'état, la date d'ajout, le prix payé si tu l'as saisi), tes cartes
            recherchées (priorité, seuil d'alerte, prix, notes) et tes dernières
            recherches.
          </P>
          <P>
            Rien d'autre. Pas de mesure d'audience, pas de traceur, pas de profilage,
            aucun service tiers chargé dans la page.
          </P>
        </Section>

        <Section title="Le scan">
          <P>
            L'image part au serveur, y est décodée en mémoire, comparée au catalogue, et
            le résultat te revient. <Term>Elle n'est écrite nulle part</Term> : ni
            fichier, ni base, ni journal. Il n'en reste rien une fois la réponse
            envoyée.
          </P>
        </Section>

        <Section title="Cookies">
          <P>
            Un seul, <Code>mytcg_refresh</Code>, qui garde ta session ouverte. Il est{' '}
            <Code>httpOnly</Code> — le JavaScript de la page ne peut pas le lire —,{' '}
            <Code>secure</Code>, <Code>SameSite=Lax</Code>, et il dure 30 jours.
          </P>
          <P>
            Il est strictement nécessaire au fonctionnement, et c'est pourquoi aucun
            bandeau ne te demande de l'accepter : il n'y a rien à refuser qui ne
            couperait pas la connexion.
          </P>
        </Section>

        <Section title="Tes droits">
          <P>
            <Term>Y accéder et les emporter</Term> : « Exporter ma collection », sur le
            Carnet de bord, en sort un fichier CSV.
          </P>
          <P>
            <Term>Les corriger</Term> : l'édition par défaut et le mot de passe se
            changent depuis le Carnet de bord.
          </P>
          <P>
            <Term>Les effacer</Term> : « Supprimer mon compte », en bas du Carnet de
            bord. Le compte, la collection, les cartes recherchées, l'historique de
            recherche et toutes les sessions partent avec, immédiatement. Le catalogue
            des cartes est commun à tout le monde et n'est pas touché.
          </P>
          <P>Pour toute autre demande, écris à <Mail />.</P>
        </Section>

        <Section title="Durée de conservation">
          <P>
            Tes données vivent aussi longtemps que ton compte. Une réserve, parce
            qu'elle est vraie : la base est sauvegardée et les sauvegardes sont gardées
            30 jours, donc ce que tu supprimes aujourd'hui disparaît des sauvegardes au
            bout d'un mois, pas le jour même.
          </P>
        </Section>

        <Section title="Les cartes">
          <P>
            One Piece Card Game, ses cartes et ses illustrations appartiennent à Bandai,
            Eiichiro Oda, Shueisha et Toei Animation. MyTCG n'est ni affilié ni approuvé
            par eux : c'est un outil d'inventaire personnel, sans vente ni échange.
          </P>
          <P>Les données du catalogue viennent du projet punk-records.</P>
        </Section>

        <Section title="Les prix">
          <P>
            Les cotes viennent de tcgcsv.com, un miroir quotidien de TCGplayer, converties
            en euros. Ce sont des prix du marché américain, pas des prix Cardmarket.
          </P>
          <P>
            Ton navigateur ne contacte jamais ces sources — c'est le serveur qui les
            relève, tous les trois jours.
          </P>
        </Section>
      </div>
    </Screen>
  )
}

/* mailto rather than a bare string: on a phone the address is only useful if tapping
   it opens something. */
function Mail() {
  return (
    <a href="mailto:dexterelmzn@gmail.com" className="underline underline-offset-2">
      dexterelmzn@gmail.com
    </a>
  )
}

/* Not `.t-code`: that class uppercases, and these are literal values a reader might
   go looking for. `HTTPONLY` and `MYTCG_REFRESH` are not what the cookie is called. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-[0.8125rem] text-[var(--text-primary)]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </code>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-8 first:pt-2">
      <h2 className="t-eyebrow pb-2.5">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
      {children}
    </p>
  )
}

/* Lead-ins are lifted out of the body colour and weight: a plain bold on a paragraph
   this dense reads as shouting, colour plus weight reads as a label. */
function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[var(--text-primary)]">{children}</span>
}
