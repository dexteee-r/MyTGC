import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { PageHeader, Screen } from '../components/ui'

/* ── Aide ──────────────────────────────────────────────────────────────────────────
   The mockup drew one row, "Aide", leading nowhere — no content was ever specified.
   There is no onboarding to sell here (01-PRODUIT.md: "personne n'a besoin d'être
   convaincu"), so this is not a tour of the whole app. It covers what is not already
   obvious from using it, and it stays out of the way of things that already explain
   themselves in place — a scan failure already says why on the spot (see CAUSE in
   ui.tsx), so this repeats the fact that it does rather than the four reasons
   themselves, which would drift the moment that dict changes and this page did not. */

export function Help() {
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

      <PageHeader title="Aide" meta="MyTCG" />

      <div className="px-5 pb-4">
        <Section title="Le scan">
          <P>
            Vise une carte à plat, bien éclairée. Le flux continu l'identifie tout seul
            dès qu'elle est nette ; une photo classique fonctionne aussi en repli.
          </P>
          <P>
            Quand ça ne marche pas, l'écran dit pourquoi — trop sombre, flou, reflet, ou
            carte inconnue du catalogue — avec le geste qui corrige. Une carte non
            reconnue peut être ajoutée à la main depuis <Term>Chercher</Term>.
          </P>
        </Section>

        <Section title="Objectif d'extension">
          <P>
            Sur la fiche d'une extension, <Term>Définir comme objectif</Term> l'épingle
            en tête du Classeur, avant les intercalaires classés automatiquement. Un
            seul objectif à la fois ; le choisir ailleurs remplace le précédent.
          </P>
        </Section>

        <Section title="Doubles">
          <P>
            Sur la Collection, la bascule <Term>Doubles</Term> ne montre que ce qui est
            détenu en plusieurs exemplaires. <Term>Possédées</Term> compte tout ;{' '}
            <Term>échangeables</Term> laisse de côté un exemplaire de chaque, celui qui
            reste dans le classeur.
          </P>
        </Section>

        <Section title="Notes et date d'ajout">
          <P>
            Sur la fiche d'une carte déjà possédée, la note et la date d'ajout se
            modifient après coup — utile pour corriger une date approximative ou noter
            une provenance ("achetée à Paris", "signée").
          </P>
        </Section>

        <Section title="Partager un lien">
          <P>
            Sur la Collection et sur Recherchées, un bouton en haut d'écran active un
            lien public en lecture seule, consultable sans compte. Il montre ce qui est
            possédé ou recherché — jamais ce qui a été payé, ni les notes. Désactiver le
            partage coupe le lien immédiatement.
          </P>
        </Section>

        <Section title="Les cotes">
          <P>
            Elles viennent de TCGplayer, un marché anglophone — les cartes japonaises
            n'en ont donc jamais. Un tirage alternatif (V.2, R.1…) n'est coté que si sa
            place dans la liste des tirages ne fait aucun doute ; sinon la fiche le dit
            plutôt que d'afficher un chiffre qui pourrait être celui d'une autre carte.
          </P>
        </Section>

        <Section title="Appareils connectés">
          <P>
            Le Carnet de bord liste les appareils actuellement connectés au compte.{' '}
            <Term>Déconnecter</Term> sur l'un d'eux y coupe la session sans toucher aux
            autres.
          </P>
        </Section>

        <Section title="Une autre question ?">
          <P>
            Écris à <Mail />.
          </P>
        </Section>
      </div>
    </Screen>
  )
}

/* Same reasoning as Legal.tsx's own Mail: a bare address is only useful on a phone if
   tapping it opens something. */
function Mail() {
  return (
    <a href="mailto:dexterelmzn@gmail.com" className="underline underline-offset-2">
      dexterelmzn@gmail.com
    </a>
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

/* Lead-ins are lifted out of the body colour rather than bolded, same as Legal.tsx:
   bold on a paragraph this dense reads as shouting, a lighter value reads as a label. */
function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[var(--text-primary)]">{children}</span>
}
