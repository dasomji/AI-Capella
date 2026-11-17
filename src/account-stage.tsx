import { shellRecipe } from "./design-system/recipes/shell";
import { useEffect, useRef, type ReactNode } from 'react';
import type { Lang } from './i18n';
import { ToggleGroup } from './design-system/react';

export function LanguageToggle({ language, onChange }: { language: Lang; onChange: (language: Lang) => void }) {
  return <div className="language-toggle"><ToggleGroup variant="language" label="Language / Sprache" separator=" · " items={([{ value: 'de', label: 'DE' }, { value: 'en', label: 'EN' }])} value={language} onChange={value => { const next = value as Lang; localStorage.setItem('ai-capella-lang', next); document.documentElement.lang = next; onChange(next); }} /></div>;
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
  return <main className={shellRecipe("account-stage")}><canvas ref={ribbons} className={shellRecipe("account-ribbons")} aria-hidden="true" /><LanguageToggle language={language} onChange={onLanguage} /><div className={shellRecipe("account-content")}><h1 ref={name} className={shellRecipe("account-wordmark")} aria-label="LightScore"><span className={shellRecipe("ls-l")}>Light</span>Score</h1><div className={shellRecipe("auth-shell")}>{children}</div></div></main>;
}
