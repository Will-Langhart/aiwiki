/**
 * "Questions people ask" — groups real chat questions into recurring demand so
 * an admin can see which answer pages to write next (answer-pages-spec §D.1:
 * pages come from demonstrated intent, not a generated matrix).
 *
 * Grouping is deliberately simple and explainable: lowercase, drop punctuation,
 * question scaffolding and stopwords, singularize. "What's the best AI coding
 * assistant?", "Best AI coding assistant?" and "What are the best AI coding
 * assistants?" all become "best ai coding assistant".
 */

export interface AskedQuestion {
  id: string;
  content: string;
  created_at: string;
}

export interface DemandGroup {
  key: string;
  /** The most recent phrasing — what the editor sees and drafts from. */
  question: string;
  count: number;
  lastAsked: string;
  /** Provenance for the draft: the most recent message in the group. */
  sourceMessageId: string;
  /** Slug of an existing answer page for this question, if any. */
  answeredBy: string | null;
}

const STOPWORDS = new Set([
  "what", "whats", "which", "who", "how", "is", "are", "the", "a", "an", "i", "me", "my",
  "can", "could", "should", "do", "does", "to", "for", "of", "and", "or", "with", "some",
  "any", "please", "you", "your", "there", "s", "tool", "tools", "ai",
]);

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Grouping key; "" when the text is too short to be a real question. */
export function normalizeQuestion(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map(singular);
  // One-word or empty prompts ("rocket", "hi") aren't answerable page topics.
  return words.length >= 2 ? words.join(" ") : "";
}

/**
 * Group questions by normalized key, most-asked first (ties: most recent).
 * `answers` marks groups an existing answer page already covers.
 */
export function groupQuestions(
  questions: AskedQuestion[],
  answers: Array<{ slug: string; question: string }> = [],
): DemandGroup[] {
  const answered = new Map(answers.map((a) => [normalizeQuestion(a.question), a.slug]));
  const groups = new Map<string, DemandGroup>();
  for (const q of questions) {
    const key = normalizeQuestion(q.content);
    if (!key || q.content.length > 300) continue;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        question: q.content.trim(),
        count: 1,
        lastAsked: q.created_at,
        sourceMessageId: q.id,
        answeredBy: answered.get(key) ?? null,
      });
    } else {
      g.count += 1;
      if (q.created_at > g.lastAsked) {
        g.lastAsked = q.created_at;
        g.question = q.content.trim();
        g.sourceMessageId = q.id;
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastAsked.localeCompare(a.lastAsked));
}
