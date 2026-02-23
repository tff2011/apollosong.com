import "dotenv/config";
import { db } from "../src/server/db.js";

type VariantRow = {
    variant: string;
    leads: number;
    converted: number;
};

type VariantStats = {
    variant: "A" | "B";
    leads: number;
    converted: number;
    conversionRate: number;
};

const DEFAULT_EXPERIMENT = "home_headline_expression_vs_emotion_v2";
const experiment = process.argv[2] ?? DEFAULT_EXPERIMENT;
const rawDays = Number.parseInt(process.argv[3] ?? "14", 10);
const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 14;

const rows = await db.$queryRaw<VariantRow[]>`
    SELECT
        COALESCE(NULLIF(SUBSTRING("landingPage" FROM 'ab_headline_variant=([AB])'), ''), 'unknown') AS variant,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (
            WHERE "status" IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'REVISION')
        )::int AS converted
    FROM "SongOrder"
    WHERE "orderType" = 'MAIN'
      AND "createdAt" >= NOW() - (${days}::int * INTERVAL '1 day')
      AND "landingPage" LIKE '%ab_experiment=' || ${experiment} || '%'
    GROUP BY 1
    ORDER BY 1
`;

const variantA = toVariantStats(rows, "A");
const variantB = toVariantStats(rows, "B");
const unknownRow = rows.find((row) => row.variant === "unknown");
const significance = calculateTwoProportionZTest(
    variantA.converted,
    variantA.leads,
    variantB.converted,
    variantB.leads
);

console.log(`\n=== A/B Headline Report (last ${days} days) ===`);
console.log(`Experiment: ${experiment}`);
console.log("Conversion = MAIN orders that reached paid pipeline: PAID | IN_PROGRESS | COMPLETED | REVISION.\n");

for (const stat of [variantA, variantB]) {
    console.log(
        `${stat.variant}: leads=${stat.leads} | converted=${stat.converted} | conversion=${formatPercent(stat.conversionRate)}`
    );
}

if (unknownRow) {
    console.log(`unknown/no-variant: leads=${unknownRow.leads} | converted=${unknownRow.converted}`);
}

if (!significance) {
    console.log("\nSignificance: inconclusive (insufficient data in A or B).");
} else {
    const lift = variantB.conversionRate - variantA.conversionRate;
    const winner = lift > 0 ? "B" : "A";
    const isSignificant = significance.pValue < 0.05;

    console.log(`\nAbsolute lift (B - A): ${formatPercent(lift)}`);
    console.log(`Z-score: ${significance.zScore.toFixed(4)}`);
    console.log(`p-value (two-tailed): ${significance.pValue.toFixed(6)}`);
    console.log(
        `Result: ${isSignificant ? `statistically significant winner = ${winner}` : "no statistically significant winner yet"}`
    );
}

await db.$disconnect();

function toVariantStats(rowsData: VariantRow[], variant: "A" | "B"): VariantStats {
    const row = rowsData.find((item) => item.variant === variant);
    const leads = row?.leads ?? 0;
    const converted = row?.converted ?? 0;
    return {
        variant,
        leads,
        converted,
        conversionRate: leads > 0 ? converted / leads : 0,
    };
}

function calculateTwoProportionZTest(
    convertedA: number,
    totalA: number,
    convertedB: number,
    totalB: number
): { zScore: number; pValue: number } | null {
    if (totalA === 0 || totalB === 0) return null;

    const pA = convertedA / totalA;
    const pB = convertedB / totalB;
    const pooled = (convertedA + convertedB) / (totalA + totalB);
    const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));

    if (!Number.isFinite(standardError) || standardError === 0) return null;

    const zScore = (pA - pB) / standardError;
    const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));

    return { zScore, pValue };
}

function normalCdf(value: number): number {
    return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value: number): number {
    const sign = value < 0 ? -1 : 1;
    const absValue = Math.abs(value);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1 / (1 + p * absValue);
    const y =
        1 -
        (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
            Math.exp(-absValue * absValue);

    return sign * y;
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}
