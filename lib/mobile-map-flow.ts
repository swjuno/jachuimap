export type AnalysisState = 'idle' | 'scanning' | 'result';
export type MobileResultSurface = 'result' | 'facility-map';
export type MobileMapScreen = 'select-map' | 'scanning' | 'result' | 'facility-map';

export function deriveMobileMapScreen(
  appState: AnalysisState,
  resultSurface: MobileResultSurface,
  hasResult: boolean,
): MobileMapScreen {
  if (appState === 'scanning') return 'scanning';
  if (appState === 'result' && hasResult) return resultSurface;
  return 'select-map';
}

export function isMobileMapScreen(screen: MobileMapScreen): boolean {
  return screen === 'select-map' || screen === 'scanning' || screen === 'facility-map';
}

export function shouldDisplayMap(screen: MobileMapScreen, isMobile: boolean): boolean {
  return !isMobile || isMobileMapScreen(screen);
}
