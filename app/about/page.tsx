// Control route for bundle size: almost no content of its own. Any JS it ships
// comes from the shared root layout.
export default function AboutPage() {
  return (
    <section className="max-w-prose rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">About Perf Lab</h1>
      <p className="mt-2 text-sm text-slate-600">
        Perf Lab is an internal analytics dashboard used as a performance-engineering playground.
      </p>
    </section>
  );
}
