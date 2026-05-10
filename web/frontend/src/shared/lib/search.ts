// Lightweight fuzzy matching: every query word must appear in the haystack
// either as a case-insensitive substring or within a length-scaled
// Levenshtein distance. The leniency curve is tuned so that "fud" → "food"
// is rejected (too short) but "restauarnt" → "restaurant" (one transposition,
// 10 chars) is accepted, while keeping random three-letter junk from
// matching anything.

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Distance budget by needle length. Small numbers must match exactly so
// "abc" can't match arbitrary words. Longer words tolerate a 2-char edit so
// transpositions and dropped letters in real-world typos still hit.
function maxDistance(len: number): number {
  if (len < 4) return 0;
  if (len < 8) return 1;
  return 2;
}

function fuzzyContains(hay: string, needle: string): boolean {
  if (hay.includes(needle)) return true;
  const budget = maxDistance(needle.length);
  if (budget === 0) return false;
  const w = needle.length;
  // Slide a window of length needle.length, plus widths +/- 1 per remaining
  // budget so we catch insertions and deletions inside the typed word.
  const widths = budget === 1 ? [w, w + 1] : [w - 1, w, w + 1, w + 2];
  for (const width of widths) {
    if (width < 1) continue;
    const limit = hay.length - width + 1;
    for (let i = 0; i < limit; i++) {
      if (levenshtein(hay.slice(i, i + width), needle) <= budget) return true;
    }
  }
  return false;
}

export function matchesQuery(query: string, fields: (string | number | null | undefined)[]): boolean {
  if (!query.trim()) return true;
  const hay = fields
    .filter((f) => f !== null && f !== undefined && f !== "")
    .join(" ")
    .toLowerCase();
  const words = query.toLowerCase().trim().split(/\s+/);
  return words.every((w) => fuzzyContains(hay, w));
}
