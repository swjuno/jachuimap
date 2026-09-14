import Script from 'next/script';
import { isMeasurementIdValid } from '@/lib/analytics';

export { isMeasurementIdValid };

export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (process.env.NODE_ENV !== 'production' || !measurementId || !isMeasurementIdValid(measurementId)) {
    return null;
  }

  const escapedId = JSON.stringify(measurementId);
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',${escapedId},{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,anonymize_ip:true,page_location:window.location.origin+window.location.pathname,page_referrer:''});`}
      </Script>
    </>
  );
}
