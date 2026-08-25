export function distributeAdvanceAcrossItems(totalAdvance, itemCount) {
  if (!Number.isFinite(totalAdvance) || totalAdvance <= 0 || !Number.isFinite(itemCount) || itemCount <= 0) {
    return [];
  }

  const base = Math.floor(totalAdvance / itemCount);
  const remainder = totalAdvance % itemCount;

  return Array.from({ length: itemCount }, (_, index) => {
    const share = base + (index < remainder ? 1 : 0);
    return share;
  });
}
