/**
 * Privacy-conscious GA4 event definitions and dispatch.
 * Only coarse result metadata is accepted by these types.
 */

export type AnalyticsSource = 'manual' | 'shared_link';
export type AnalyticsTier = 'S' | 'A' | 'B' | 'C' | 'F';
export type ScoreBand = '0_44' | '45_59' | '60_74' | '75_89' | '90_100';
export type ShareMethod = 'native_share' | 'clipboard';
export type PublicErrorCode =
  | 'GEOCODING_FAILED'
  | 'INFRASTRUCTURE_FETCH_FAILED'
  | 'ADDRESS_NOT_FOUND'
  | 'INVALID_COORDINATES'
  | 'MISSING_PARAMS'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

export interface AnalyticsEventParams {
  analysis_started: { source: AnalyticsSource };
  analysis_completed: {
    source: AnalyticsSource;
    tier: AnalyticsTier;
    score_band: ScoreBand;
    is_mock: boolean;
  };
  analysis_failed: {
    source: AnalyticsSource;
    error_code: PublicErrorCode;
    retryable: boolean;
  };
  share_clicked: { tier: AnalyticsTier; score_band: ScoreBand };
  share_completed: { method: ShareMethod; tier: AnalyticsTier; score_band: ScoreBand };
  share_cancelled: { method: 'native_share' };
  png_downloaded: { tier: AnalyticsTier; score_band: ScoreBand };
  reanalyze_clicked: { previous_tier: AnalyticsTier };
  shared_link_opened: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEventParams;
export type AnalyticsSender = <T extends AnalyticsEventName>(
  name: T,
  params: AnalyticsEventParams[T],
) => void;

type Gtag = (
  command: 'event',
  name: AnalyticsEventName,
  params: AnalyticsEventParams[AnalyticsEventName],
) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const PUBLIC_ERROR_CODES: readonly PublicErrorCode[] = [
  'GEOCODING_FAILED',
  'INFRASTRUCTURE_FETCH_FAILED',
  'ADDRESS_NOT_FOUND',
  'INVALID_COORDINATES',
  'MISSING_PARAMS',
  'RATE_LIMITED',
  'UNKNOWN_ERROR',
];

export function getScoreBand(score: number): ScoreBand | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score <= 44) return '0_44';
  if (score <= 59) return '45_59';
  if (score <= 74) return '60_74';
  if (score <= 89) return '75_89';
  return '90_100';
}

export function isMeasurementIdValid(value: string | undefined): boolean {
  return value !== undefined && /^G-[A-Z0-9]+$/.test(value.trim());
}

export function toPublicErrorCode(value: unknown): PublicErrorCode {
  return typeof value === 'string' && PUBLIC_ERROR_CODES.includes(value as PublicErrorCode)
    ? value as PublicErrorCode
    : 'UNKNOWN_ERROR';
}

function browserSender(): AnalyticsSender | undefined {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return undefined;
  return (name, params) => window.gtag?.('event', name, params);
}

function sanitizeEventParams<T extends AnalyticsEventName>(
  name: T,
  params: AnalyticsEventParams[T],
): AnalyticsEventParams[T] {
  switch (name) {
    case 'analysis_started':
      return { source: (params as AnalyticsEventParams['analysis_started']).source } as AnalyticsEventParams[T];
    case 'analysis_completed': {
      const value = params as AnalyticsEventParams['analysis_completed'];
      return {
        source: value.source,
        tier: value.tier,
        score_band: value.score_band,
        is_mock: value.is_mock,
      } as AnalyticsEventParams[T];
    }
    case 'analysis_failed': {
      const value = params as AnalyticsEventParams['analysis_failed'];
      return {
        source: value.source,
        error_code: value.error_code,
        retryable: value.retryable,
      } as AnalyticsEventParams[T];
    }
    case 'share_clicked': {
      const value = params as AnalyticsEventParams['share_clicked'];
      return { tier: value.tier, score_band: value.score_band } as AnalyticsEventParams[T];
    }
    case 'share_completed': {
      const value = params as AnalyticsEventParams['share_completed'];
      return { method: value.method, tier: value.tier, score_band: value.score_band } as AnalyticsEventParams[T];
    }
    case 'share_cancelled':
      return { method: 'native_share' } as AnalyticsEventParams[T];
    case 'png_downloaded': {
      const value = params as AnalyticsEventParams['png_downloaded'];
      return { tier: value.tier, score_band: value.score_band } as AnalyticsEventParams[T];
    }
    case 'reanalyze_clicked':
      return { previous_tier: (params as AnalyticsEventParams['reanalyze_clicked']).previous_tier } as AnalyticsEventParams[T];
    case 'shared_link_opened':
      return {} as AnalyticsEventParams[T];
  }
  throw new Error(`Unsupported analytics event: ${String(name)}`);
}

export function trackEvent<T extends AnalyticsEventName>(
  name: T,
  params: AnalyticsEventParams[T],
  options: { sender?: AnalyticsSender; isProduction?: boolean } = {},
): boolean {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const sender = options.sender ?? browserSender();
  if (!isProduction || !sender) return false;
  sender(name, sanitizeEventParams(name, params));
  return true;
}

export function trackAnalysisCompletedOnce(
  requestKey: string,
  completedKeys: Set<string>,
  params: AnalyticsEventParams['analysis_completed'],
  options: { sender?: AnalyticsSender; isProduction?: boolean } = {},
): boolean {
  if (completedKeys.has(requestKey)) return false;
  completedKeys.add(requestKey);
  return trackEvent('analysis_completed', params, options);
}
