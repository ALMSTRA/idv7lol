import { useEffect, useState } from 'react';
import { validateTheme, type ValidationReport } from '@idv7lol/theme-compiler';
import { useProjectStore } from '../store/project.js';

let cache: { theme: unknown; report: ValidationReport } | null = null;

/** Validation report of the current theme, recomputed 250 ms after the last edit. */
export function useValidation(): ValidationReport | null {
  const theme = useProjectStore((s) => s.theme);
  const [report, setReport] = useState<ValidationReport | null>(() =>
    cache?.theme === theme ? cache.report : null,
  );
  useEffect(() => {
    if (cache?.theme === theme) {
      setReport(cache.report);
      return;
    }
    const h = setTimeout(() => {
      const r = validateTheme(theme);
      cache = { theme, report: r };
      setReport(r);
    }, 250);
    return () => clearTimeout(h);
  }, [theme]);
  return report;
}
