import type { SimilarityMatcher, CacheEntry } from '../interfaces/index.js';

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

export class LevenshteinSimilarityMatcher implements SimilarityMatcher {
  calculateSimilarity(prompt1: string, prompt2: string): number {
    const normalized1 = normalize(prompt1);
    const normalized2 = normalize(prompt2);

    if (normalized1.length === 0 || normalized2.length === 0) return 0.0;
    if (normalized1 === normalized2) return 1.0;

    const distance = levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    return 1.0 - (distance / maxLength);
  }

  async findSimilar(
    prompt: string,
    entries: CacheEntry<any>[],
    threshold: number
  ): Promise<CacheEntry<any> | null> {
    if (entries.length === 0) return null;

    let bestMatch: CacheEntry<any> | null = null;
    let bestScore = 0;

    for (const entry of entries) {
      const entryPrompt = (entry.metadata?.prompt as string) || '';
      const score = this.calculateSimilarity(prompt, entryPrompt);

      if (score >= threshold && score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    return bestMatch;
  }
}
