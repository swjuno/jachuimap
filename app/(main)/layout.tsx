import GoogleAnalytics from '@/components/GoogleAnalytics';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAnalytics />
      {children}
    </>
  );
}
