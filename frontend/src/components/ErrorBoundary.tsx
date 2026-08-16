import { Component, type ReactNode } from 'react'
import { Adrift } from './ui'

/* Catches a render crash that nothing upstream expects -- a response shaped
   differently than assumed, a null reached where a value was taken for granted,
   anything that throws while React is painting. Without this the whole tab goes
   blank and stays blank: React unmounts everything above the throw, and nothing
   tells the person looking at it what to do next.

   What is caught never leaves the device. Legal.tsx already promises "aucun
   service tiers chargé dans la page, pas de mesure d'audience" -- a stack trace
   sent to a tracking service would break that promise the first time it fired,
   so this only reaches the console, for whoever is looking at this machine's own
   logs. */

interface Props {
  children: ReactNode
}

interface State {
  crashed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error('MyTCG a planté en affichant un écran :', error, info.componentStack)
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="px-5 pt-14">
          <Adrift
            title="Une carte est tombée"
            onRetry={() => this.setState({ crashed: false })}
          >
            Cet écran a rencontré un problème et n'a pas pu s'afficher. Réessaie —
            si ça continue, un rechargement complet repart d'une base saine.
          </Adrift>
        </div>
      )
    }
    return this.props.children
  }
}
