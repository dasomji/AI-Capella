import { useEffect, useRef, type ReactNode } from 'react';
import type { Lang } from './i18n';

export function LanguageToggle({ language, onChange }: { language: Lang; onChange: (language: Lang) => void }) {
  return <div className="language-toggle" aria-label="Language / Sprache">{(['de', 'en'] as const).map((value, i) => <span key={value}>{i > 0 && <span aria-hidden="true"> · </span>}<button type="button" aria-pressed={language === value} onClick={() => { localStorage.setItem('ai-capella-lang', value); document.documentElement.lang = value; onChange(value); }}>{value.toUpperCase()}</button></span>)}</div>;
}
export function AccountStage({ language, onLanguage, children }: { language: Lang; onLanguage: (language: Lang) => void; children: ReactNode }) {
  const name = useRef<HTMLHeadingElement>(null);
  const ribbons = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stopped = false;
    let stop = () => {};
    void Promise.all([import('./lightName'), import('./artwork')]).then(([{ lightScoreName }, { animateRibbons }]) => {
      if (stopped || !name.current || !ribbons.current) return;
      const mark = lightScoreName(name.current, 'swarm');
      const stopRibbons = animateRibbons(ribbons.current, (w, h) => ({ voices: 5, x0: -80, x1: w + 80, cy: h * .3, gap: 26, amp: 45, line: 1.4, halo: 9 }), { swarm: true, pace: .72 });
      stop = () => { stopRibbons(); mark.dispose(); };
      void mark.shown.then(() => mark.push());
    });
    return () => { stopped = true; stop(); };
  }, []);
  return <main className="account-stage"><canvas ref={ribbons} className="account-ribbons" aria-hidden="true" /><LanguageToggle language={language} onChange={onLanguage} /><div className="account-content"><h1 ref={name} className="account-wordmark" aria-label="LightScore"><span className="ls-l">Light</span>Score</h1><div className="auth-shell">{children}</div></div></main>;
}
