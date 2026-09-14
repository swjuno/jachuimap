'use client';
import { useEffect, useRef } from 'react';

/** Full navigation: never load analytics while the token is in the address bar. */
export default function ShareRedirect({ href }: { href: string }) {
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    window.location.replace(href);
  }, [href]);
  return <a href={href} referrerPolicy="no-referrer">같은 위치의 현재 결과 분석하기</a>;
}
