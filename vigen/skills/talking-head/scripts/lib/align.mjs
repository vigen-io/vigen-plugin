// Put whisper timings onto the known script words (we always have the exact script
// because the voice is TTS). Global token alignment, diacritic-insensitive; unmatched
// script words get times interpolated from their neighbours.

export const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function sim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // normalized edit distance
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

export function tokenizeScript(text) {
  return text.split(/\s+/).map((t) => t.trim()).filter((t) => norm(t));
}

/**
 * @param {string[]} scriptWords display tokens (with punctuation)
 * @param {{text:string,start:number,end:number}[]} heard whisper words
 * @returns {{text:string,start:number,end:number,matched:boolean}[]}
 */
export function alignWords(scriptWords, heard) {
  const A = scriptWords.map(norm);
  const B = heard.map((w) => norm(w.text));
  const n = A.length, m = B.length;
  const GAP = -0.4;
  const S = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const P = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 up (skip script), 3 left (skip heard)
  for (let i = 1; i <= n; i++) (S[i][0] = i * GAP), (P[i][0] = 2);
  for (let j = 1; j <= m; j++) (S[0][j] = j * GAP), (P[0][j] = 3);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = sim(A[i - 1], B[j - 1]);
      const diag = S[i - 1][j - 1] + (s >= 0.5 ? s : s - 1);
      const up = S[i - 1][j] + GAP;
      const left = S[i][j - 1] + GAP;
      if (diag >= up && diag >= left) (S[i][j] = diag), (P[i][j] = 1);
      else if (up >= left) (S[i][j] = up), (P[i][j] = 2);
      else (S[i][j] = left), (P[i][j] = 3);
    }
  const out = scriptWords.map((t) => ({ text: t, start: NaN, end: NaN, matched: false }));
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = P[i][j];
    if (p === 1) {
      if (sim(A[i - 1], B[j - 1]) >= 0.5) Object.assign(out[i - 1], { start: heard[j - 1].start, end: heard[j - 1].end, matched: true, said: heard[j - 1].text });
      i--, j--;
    } else if (p === 2) i--;
    else j--;
  }
  // Interpolate gaps between matched anchors, splitting time by character count.
  const first = heard[0]?.start ?? 0;
  const last = heard[heard.length - 1]?.end ?? 0;
  let k = 0;
  while (k < out.length) {
    if (out[k].matched) { k++; continue; }
    let e = k;
    while (e < out.length && !out[e].matched) e++;
    const t0 = k > 0 ? out[k - 1].end : first;
    const t1 = e < out.length ? out[e].start : last;
    const chars = out.slice(k, e).reduce((s, w) => s + w.text.length, 0) || 1;
    let t = t0;
    for (let q = k; q < e; q++) {
      const span = ((t1 - t0) * out[q].text.length) / chars;
      out[q].start = +t.toFixed(3);
      out[q].end = +(t + span).toFixed(3);
      t += span;
    }
    k = e;
  }
  return out;
}

/** Phrase lines for reading/authoring: break at punctuation or a pause ≥ 0.25 s. */
export function phrases(words, { maxWords = 9 } = {}) {
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const pause = i < words.length - 1 ? words[i + 1].start - words[i].end : 9;
    if (/[.!?…,;:]$/.test(words[i].text) || pause >= 0.25 || cur.length >= maxWords || i === words.length - 1) {
      out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" "), from: i - cur.length + 1, to: i });
      cur = [];
    }
  }
  return out;
}
