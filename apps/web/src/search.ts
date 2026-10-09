function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function matchesSearch(value: string, query: string): boolean {
  const text = normalize(value);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const digits = value.replace(/\D/g, "");
  return terms.every((term) =>
    /^\d+$/.test(term) ? digits.includes(term) : text.includes(term),
  );
}
