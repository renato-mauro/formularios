// Distribui as 12 colunas de uma linha entre os campos (agentes.md §4).
// items: [{ weight, fixed }] — fixed = colunas fixas (listas) ou null.
// Devolve { cols } ou { error }.
export function distribute(items, total = 12) {
  if (items.length > total) return { error: `mais de ${total} campos na mesma linha` };
  const fixedSum = items.reduce((s, it) => s + (it.fixed || 0), 0);
  if (fixedSum > total) return { error: `as larguras fixas somam ${fixedSum} colunas (máximo ${total})` };

  const flex = items.map((it, i) => ({ ...it, i })).filter((it) => !it.fixed);
  const cols = items.map((it) => it.fixed || 0);
  if (!flex.length) return { cols };

  const room = total - fixedSum;
  if (room < flex.length) return { error: 'não há colunas suficientes para os campos desta linha' };

  const weightSum = flex.reduce((s, it) => s + it.weight, 0);
  const ideal = flex.map((it) => (weightSum ? (room * it.weight) / weightSum : room / flex.length));
  flex.forEach((it, k) => { cols[it.i] = Math.max(1, Math.floor(ideal[k])); });

  let sum = flex.reduce((s, it) => s + cols[it.i], 0);
  const byRemainder = flex
    .map((it, k) => ({ i: it.i, r: ideal[k] - Math.floor(ideal[k]) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  while (sum < room) {
    for (const { i } of byRemainder) {
      if (sum >= room) break;
      cols[i]++;
      sum++;
    }
  }
  while (sum > room) {
    let big = -1;
    for (const it of flex) if (cols[it.i] > 1 && (big < 0 || cols[it.i] > cols[big])) big = it.i;
    cols[big]--;
    sum--;
  }
  return { cols };
}
