"use client";

import { useEffect, useState } from "react";

const BANNER_DELAY_MS = 1500;

const PREFERENCES = [
  { id: "necessary", label: "Strictly necessary", detail: "Sign-in, security and load balancing.", locked: true },
  { id: "analytics", label: "Product analytics", detail: "Helps us understand which reports you use.", locked: false },
  { id: "marketing", label: "Marketing", detail: "Personalised offers for Perf Lab Pro.", locked: false },
];

// PERF-BUG #7: a cookie/promo banner mounts ~1.5 s after hydration at the very
// top of the page with no reserved space, pushing the whole layout down (CLS).
export function PromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), BANNER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div data-testid="promo-banner" className="bg-indigo-600 px-4 py-5 text-sm text-white md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-base font-semibold">Perf Lab Pro is here 🎉</p>
          <p className="mt-1 text-indigo-100">
            Real-time cohorts, anomaly alerts and scheduled exports. Upgrade before Nov 30 and get 3 months free. We
            use cookies to measure product usage and to personalise offers. Choose what you are comfortable with.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {PREFERENCES.map((p) => (
              <li key={p.id} className="flex items-start gap-2 rounded-md bg-indigo-500/40 p-2">
                <input type="checkbox" defaultChecked disabled={p.locked} className="mt-0.5" aria-label={p.label} />
                <span>
                  <span className="block font-medium">{p.label}</span>
                  <span className="block text-xs text-indigo-100">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="rounded-md bg-white px-3 py-1.5 font-medium text-indigo-700">Accept &amp; upgrade</button>
          <button
            className="rounded-md px-3 py-1.5 font-medium text-indigo-100 ring-1 ring-indigo-300"
            onClick={() => setVisible(false)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
