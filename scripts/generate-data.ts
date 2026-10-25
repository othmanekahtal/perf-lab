/**
 * Deterministic transaction generator.
 * Writes ~5 MB of JSON to public/data/transactions.json.
 *
 * PERF-BUG #2: this file is deliberately large and is fetched + parsed on the
 * client main thread in full.
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const ROW_COUNT = 20_000;
const SEED = 0xc0ffee;
const OUT = join(process.cwd(), "public", "data", "transactions.json");

// mulberry32: small, fast, seedable PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

const FIRST = ["Ava", "Liam", "Noah", "Emma", "Olivia", "Mateo", "Yuki", "Amara", "Omar", "Lena", "Sofia", "Ravi", "Chen", "Fatima", "Lucas", "Ines", "Kwame", "Hana", "Diego", "Zara"];
const LAST = ["Nguyen", "Garcia", "Smith", "Kowalski", "Haddad", "Okafor", "Tanaka", "Rossi", "Müller", "Dubois", "Silva", "Patel", "Kim", "Andersson", "Benali", "Novak", "Moreau", "Ivanova", "Costa", "Larsen"];
const COMPANY = ["Acme Corp", "Globex", "Initech", "Umbrella", "Hooli", "Stark Industries", "Wayne Enterprises", "Soylent", "Tyrell", "Cyberdyne", "Wonka", "Vandelay", "Pied Piper", "Aperture", "Massive Dynamic"];
const CATEGORY = ["Software", "Hardware", "Consulting", "Support", "Training", "Licensing", "Cloud", "Marketing"] as const;
const REGION = ["North America", "EMEA", "LATAM", "APAC"] as const;
const COUNTRY: Record<(typeof REGION)[number], string[]> = {
  "North America": ["US", "CA", "MX"],
  EMEA: ["GB", "DE", "FR", "MA", "NL", "SE", "ES"],
  LATAM: ["BR", "AR", "CL", "CO"],
  APAC: ["JP", "IN", "AU", "SG", "KR"],
};
const STATUS = ["completed", "completed", "completed", "pending", "failed", "refunded"] as const;
const METHOD = ["card", "wire", "ach", "paypal", "invoice"] as const;
const CURRENCY = ["USD", "EUR", "GBP", "JPY", "MAD"] as const;
const TAGS = ["priority", "renewal", "upsell", "new-logo", "churn-risk", "enterprise", "smb", "partner", "promo", "audit"];

const START = Date.UTC(2024, 0, 1);
const SPAN = Date.UTC(2026, 9, 1) - START;

const rows = [];
for (let i = 0; i < ROW_COUNT; i++) {
  const region = pick(REGION);
  const first = pick(FIRST);
  const last = pick(LAST);
  const company = pick(COMPANY);
  const qty = 1 + Math.floor(rand() * 40);
  const unit = Math.round((5 + rand() * 2500) * 100) / 100;
  const tagCount = Math.floor(rand() * 4);
  const tags: string[] = [];
  for (let t = 0; t < tagCount; t++) tags.push(pick(TAGS));
  rows.push({
    id: `TXN-${String(i + 1).padStart(6, "0")}`,
    date: new Date(START + Math.floor(rand() * SPAN)).toISOString(),
    customer: `${first} ${last}`,
    email: `${first}.${last}@${company.toLowerCase().replace(/[^a-z]/g, "")}.example`.toLowerCase(),
    company,
    category: pick(CATEGORY),
    region,
    country: pick(COUNTRY[region]),
    status: pick(STATUS),
    method: pick(METHOD),
    currency: pick(CURRENCY),
    quantity: qty,
    unitPrice: unit,
    amount: Math.round(qty * unit * 100) / 100,
    discount: Math.round(rand() * 30) / 100,
    rating: Math.round(rand() * 50) / 10,
    tags,
    notes: `Order ${i + 1} for ${company} (${region}). Contact ${first} regarding ${pick(CATEGORY).toLowerCase()} follow-up.`,
  });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
const mb = statSync(OUT).size / 1024 / 1024;
console.log(`wrote ${rows.length} rows → ${OUT} (${mb.toFixed(2)} MB)`);
