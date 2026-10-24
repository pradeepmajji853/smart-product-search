// Typo tolerance for keyword search, built on pg_trgm.
//
// Only used when a search finds nothing. Each search term that matches no product at
// all is replaced by the most similar word from the catalogue vocabulary
// (search_vocabulary, see database/schema.sql); terms that do match something are kept.
// The corrected query is then run as a normal, exact search, so filters, sorting and
// pagination behave exactly as for any other query.
import { escapeLike } from './like.js';

// Minimum pg_trgm similarity (0-1) for a vocabulary word to count as a correction.
// Chosen by measuring real typos against the seeded catalogue: 0.3 accepts
// "sonny"->"sony", "hedphones"->"headphones", "camra"->"camera", but rejects
// unrelated words such as "blender"->"grinder" (0.23). See docs/IMPLEMENTATION.md.
export const SIMILARITY_THRESHOLD = 0.3;
const MIN_TERM_LENGTH = 3;

async function correctTerm(db, term) {
  const found = await db.query(
    `SELECT EXISTS (SELECT 1 FROM products WHERE search_text ILIKE $1 ESCAPE '\\') AS found`,
    [`%${escapeLike(term)}%`],
  );
  if (found.rows[0].found) return { word: term, changed: false };
  if (term.length < MIN_TERM_LENGTH) return null;

  // "word % $1" lets the trigram index find candidates; the explicit similarity
  // check keeps the threshold independent of the pg_trgm.similarity_threshold setting.
  const { rows } = await db.query(
    `SELECT word FROM search_vocabulary
     WHERE word % $1 AND similarity(word, $1) >= $2
     ORDER BY similarity(word, $1) DESC, frequency DESC, word ASC
     LIMIT 1`,
    [term.toLowerCase(), SIMILARITY_THRESHOLD],
  );
  return rows.length > 0 ? { word: rows[0].word, changed: true } : null;
}

// Returns the corrected list of terms, or null when no useful correction exists
// (every term already matches something, or some term has no close vocabulary word).
export async function correctTerms(db, terms) {
  const results = await Promise.all(terms.map((term) => correctTerm(db, term)));
  if (results.some((r) => r === null) || !results.some((r) => r.changed)) return null;
  return results.map((r) => r.word);
}
