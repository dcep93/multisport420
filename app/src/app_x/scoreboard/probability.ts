// NFLStream's recovered erf approximation and uncertainty constants.
export function normalCdf(x: number): number {
  if (x === 0) return 0.5;
  const sign = x >= 0 ? 1 : -1;
  const value = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * value);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t +
    1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-value * value);
  return 0.5 * (1 + sign * erf);
}

export function upcoming(score: number, projected: number): number {
  const remaining = Math.max(0, projected - score);
  return remaining + Math.min(remaining, 5);
}

export function headToHeadProbability(a: { score: number; projected: number }, b: { score: number; projected: number }): number {
  const sigma = 8 * Math.sqrt((upcoming(a.score, a.projected) + upcoming(b.score, b.projected)) / 12);
  const diff = a.projected - b.projected;
  return sigma > 0 ? normalCdf(diff / sigma) : diff === 0 ? 0.5 : Number(diff > 0);
}

export function guillotineSigma(score: number, projected: number): number {
  return Math.max(0.01, 8 * Math.sqrt(upcoming(score, projected) / 12));
}

function integrate(f: (x: number) => number, a: number, b: number, tolerance: number): number {
  const mid = (a + b) / 2;
  const fa = f(a), fm = f(mid), fb = f(b);
  const whole = (b - a) * (fa + 4 * fm + fb) / 6;
  function split(left: number, right: number, fl: number, fc: number, fr: number, estimate: number, eps: number, depth: number): number {
    const center = (left + right) / 2;
    const f1 = f((left + center) / 2), f2 = f((center + right) / 2);
    const first = (center - left) * (fl + 4 * f1 + fc) / 6;
    const second = (right - center) * (fc + 4 * f2 + fr) / 6;
    const delta = first + second - estimate;
    if (depth === 0 || Math.abs(delta) <= 15 * eps) return first + second + delta / 15;
    return split(left, center, fl, f1, fc, first, eps / 2, depth - 1) +
      split(center, right, fc, f2, fr, second, eps / 2, depth - 1);
  }
  return split(a, b, fa, fm, fb, whole, tolerance, 18);
}

/** P(X_i is the minimum), for independent normal final scores.
 * Reimplementation of the recovered model; the old guillotine.ts was not recovered.
 * Integrate in each team's standardized coordinates; split at competing CDF
 * transitions so a finished team's 0.01 sigma is not missed by quadrature.
 */
export function probNormalMinAll(means: number[], sigmas: number[]): number[] {
  if (means.length !== sigmas.length || means.some(x => !Number.isFinite(x)) ||
      sigmas.some(x => !Number.isFinite(x) || x <= 0)) throw new Error("Invalid normal distributions");
  if (!means.length) return [];
  if (means.length === 1) return [1];
  if (means.length === 2) {
    const first = normalCdf((means[1] - means[0]) / Math.hypot(...sigmas));
    return [first, 1 - first];
  }
  const risks = means.map((mean, i) => {
    const sigma = sigmas[i];
    const knots = new Set([-9, -6, -3, 0, 3, 6, 9]);
    means.forEach((other, j) => {
      if (j === i) return;
      for (const offset of [-8, -4, -2, 0, 2, 4, 8]) {
        const z = (other + offset * sigmas[j] - mean) / sigma;
        if (z > -9 && z < 9) knots.add(z);
      }
    });
    const points = [...knots].sort((a, b) => a - b);
    const density = (z: number) => {
      let value = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
      for (let j = 0; j < means.length; j++) {
        if (j !== i) value *= normalCdf((means[j] - mean - sigma * z) / sigmas[j]);
      }
      return value;
    };
    return Math.max(0, points.slice(1).reduce((sum, b, k) =>
      sum + integrate(density, points[k], b, 1e-9 / points.length), 0));
  });
  const total = risks.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error("Could not calculate Guillotine probabilities");
  return risks.map(risk => risk / total);
}
