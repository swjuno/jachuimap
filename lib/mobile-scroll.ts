export type ScrollPhase = 'scanning' | 'result' | 'error';

export interface ScrollState {
  requestId: number;
  scanningDone: boolean;
  resultDone: boolean;
  errorDone: boolean;
  userInterrupted: boolean;
}

export function canAutoScroll(state: ScrollState, phase: ScrollPhase, requestId: number): boolean {
  if (state.requestId !== requestId || state.userInterrupted) return false;
  if (phase === 'scanning') return !state.scanningDone;
  if (phase === 'result') return !state.resultDone;
  return !state.errorDone;
}

export function markAutoScrolled(state: ScrollState, phase: ScrollPhase): void {
  if (phase === 'scanning') state.scanningDone = true;
  else if (phase === 'result') state.resultDone = true;
  else state.errorDone = true;
}

export function getScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'instant' : 'smooth';
}
