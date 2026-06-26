/**
 * Run discover-tools in safe batches of 5 (avoids 150s edge function timeout).
 * Usage: npx tsx scripts/run-discover.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BATCH_SIZE = 3;
const DELAY_MS = 1000;

const ALL_URLS = [
  // BATCH 1 — PRODUCTIVITY
  "https://fathom.video",
  "https://tldv.io",
  "https://granola.ai",
  "https://www.read.ai",
  "https://www.supernormal.com",
  "https://www.notta.ai",
  "https://www.sembly.ai",
  "https://www.limitless.ai",
  "https://getclockwise.com",
  "https://superhuman.com",
  "https://shortwave.com",
  "https://coda.io",
  "https://craft.do",
  "https://capacities.io",
  "https://obsidian.md",
  "https://roamresearch.com",
  "https://www.notion.so",
  "https://logseq.com",
  // BATCH 2 — CUSTOMER SUPPORT
  "https://www.freshdesk.com",
  "https://www.zendesk.com",
  "https://www.kustomer.com",
  "https://www.gladly.com",
  "https://forethought.ai",
  "https://www.certainly.io",
  "https://www.boost.ai",
  "https://ultimate.ai",
  "https://www.cognigy.com",
  "https://capacity.com",
  "https://www.helpshift.com",
  "https://www.talkdesk.com",
  "https://www.nice.com",
  "https://www.genesys.com",
  "https://hiver.com",
  "https://www.dixa.com",
  "https://www.assembled.com",
  // BATCH 3 — EDUCATION
  "https://khanmigo.ai",
  "https://www.synthesis.com",
  "https://www.brilliant.org",
  "https://quizlet.com",
  "https://www.explainpaper.com",
  "https://www.scholarcy.com",
  "https://www.humata.ai",
  "https://magicschool.ai",
  "https://photomath.com",
  "https://nolej.io",
  "https://curipod.com",
  "https://teachfx.com",
  "https://diffit.me",
  "https://www.duolingo.com",
  "https://learnosity.com",
  // BATCH 4 — NO-CODE
  "https://bubble.io",
  "https://www.webflow.com",
  "https://www.softr.io",
  "https://www.glideapps.com",
  "https://www.appsmith.com",
  "https://create.xyz",
  "https://www.dora.run",
  "https://www.typebot.io",
  "https://www.stack-ai.com",
  "https://botpress.com",
  "https://adalo.com",
  "https://www.weweb.io",
  "https://www.xano.com",
  "https://flutterflow.io",
  "https://www.pory.io",
  "https://www.noloco.io",
  // BATCH 5 — SECURITY
  "https://wiz.io",
  "https://orca.security",
  "https://www.sentinelone.com",
  "https://www.crowdstrike.com",
  "https://www.darktrace.com",
  "https://snyk.io",
  "https://semgrep.dev",
  "https://aikido.dev",
  "https://socket.dev",
  "https://www.cycode.com",
  "https://legitsecurity.com",
  "https://www.checkmarx.com",
  "https://www.veracode.com",
  "https://www.sonatype.com",
  "https://www.aquasec.com",
  "https://www.stackhawk.com",
  // BATCH 6 — LEGAL
  "https://www.harvey.ai",
  "https://spellbook.legal",
  "https://casetext.com",
  "https://www.luminance.com",
  "https://www.evisort.com",
  "https://ironcladapp.com",
  "https://contractbook.com",
  "https://juro.com",
  "https://www.robin.ai",
  "https://www.lexion.ai",
  "https://summize.com",
  "https://paxton.ai",
  "https://www.clio.com",
  "https://www.everlaw.com",
  "https://www.litera.com",
  // BATCH 7 — HR & RECRUITING
  "https://www.ashbyhq.com",
  "https://www.greenhouse.io",
  "https://www.lever.co",
  "https://www.paradox.ai",
  "https://hireez.com",
  "https://www.fetcher.ai",
  "https://dover.com",
  "https://screenloop.com",
  "https://www.hirevue.com",
  "https://eightfold.ai",
  "https://findem.ai",
  "https://gem.com",
  "https://beamery.com",
  "https://karat.com",
  "https://www.metaview.ai",
  "https://humanly.io",
  "https://modernloop.io",
  // BATCH 8 — FINANCE
  "https://www.rippling.com",
  "https://www.deel.com",
  "https://www.bamboohr.com",
  "https://zeni.ai",
  "https://www.pilot.com",
  "https://bench.co",
  "https://digits.com",
  "https://www.ramp.com",
  "https://vic.ai",
  "https://www.stampli.com",
  "https://www.spendesk.com",
  "https://www.airbase.com",
  "https://www.brex.com",
  "https://mercury.com",
  "https://alpha-sense.com",
  "https://www.mosaic.tech",
  "https://runwayfinancial.com",
  // BATCH 9 — HEALTHCARE
  "https://nabla.com",
  "https://www.suki.ai",
  "https://www.ambiencehealthcare.com",
  "https://www.abridge.com",
  "https://www.recursion.com",
  "https://insilico.com",
  "https://www.atomwise.com",
  "https://www.benchsci.com",
  "https://www.tempus.com",
  "https://www.pathai.com",
  "https://www.aidoc.com",
  "https://viz.ai",
  "https://www.flatiron.com",
  "https://deepscribe.ai",
  "https://infermedica.com",
  "https://unlearn.ai",
  // BATCH 10 — CODING
  "https://www.coderabbit.ai",
  "https://swimm.io",
  "https://mintlify.com",
  "https://www.codacy.com",
  "https://www.mutableai.com",
  "https://www.codemod.com",
  "https://www.augmentcode.com",
  "https://www.factory.ai",
  "https://www.plandex.ai",
  "https://www.sweep.dev",
  "https://www.qodo.ai",
  "https://www.sourcery.ai",
  // BATCH 11 — WRITING & MARKETING
  "https://www.anyword.com",
  "https://www.hypotenuse.ai",
  "https://www.phrasee.co",
  "https://www.persado.com",
  "https://www.mutinyhq.com",
  "https://www.pencil.li",
  "https://www.lately.ai",
  "https://www.taplio.com",
  "https://www.scalenut.com",
  "https://www.marketmuse.com",
  "https://www.clearscope.io",
  "https://www.surfer.com",
  // BATCH 12 — IMAGE & VIDEO
  "https://www.haiper.ai",
  "https://www.hedra.com",
  "https://www.genmo.ai",
  "https://www.pixverse.ai",
  "https://www.jogg.ai",
  "https://www.topaz.ai",
  "https://www.remini.ai",
  "https://www.aragon.ai",
  "https://www.headshotpro.com",
  "https://www.studio.d-id.com",
  // BATCH 13 — MLOPS & INFRA
  "https://www.runpod.io",
  "https://www.cerebrium.ai",
  "https://www.dstack.ai",
  "https://www.lepton.ai",
  "https://www.jina.ai",
  "https://www.clarifai.com",
  "https://www.nyckel.com",
  "https://www.roboflow.com",
  "https://www.superannotate.com",
  "https://www.dataloop.ai",
  "https://www.v7labs.com",
];

async function discoverBatch(urls: string[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/discover-tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(140_000),
  });

  const json = await res.json() as {
    results?: Array<{ url: string; slug: string | null; status: string; error?: string }>;
    summary?: { succeeded: number; errored: number; total: number };
    error?: string;
  };

  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  for (const r of json.results ?? []) {
    const icon = r.status === "error" ? "✗" : "✓";
    const detail = r.status === "error" ? r.error : `/tools/${r.slug}`;
    console.log(`  ${icon} ${r.url} → ${detail}`);
  }

  const s = json.summary;
  if (s) console.log(`  → ${s.succeeded} ok, ${s.errored} errors\n`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ALL_URLS.length; i += BATCH_SIZE) {
    chunks.push(ALL_URLS.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n🚀 Discovering ${ALL_URLS.length} tools in ${chunks.length} batches of ${BATCH_SIZE}\n`);

  let totalOk = 0;
  let totalErr = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Batch ${i + 1}/${chunks.length}: ${chunk[0]} … ${chunk[chunk.length - 1]}`);
    try {
      await discoverBatch(chunk);
      totalOk += chunk.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cost cap") || msg.includes("429")) {
        console.log(`\n💸 Daily cost cap hit — stopping. Re-run tomorrow to continue from batch ${i + 1}.\n`);
        break;
      }
      console.log(`  ✗ Batch failed: ${msg}\n`);
      totalErr += chunk.length;
    }
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\nDone — ~${totalOk} attempted, ~${totalErr} batch failures`);
}

main();
