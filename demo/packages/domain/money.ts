export function exactMoney(cents: string | bigint): string {
  const value = BigInt(cents), negative = value < 0n, absolute = negative ? -value : value;
  const grouped = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(absolute / 100n);
  const parts = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).formatToParts(negative ? -1 : 1);
  const prefix = parts.filter(part => ['minusSign','currency','literal'].includes(part.type)).map(part => part.value).join('');
  return `${prefix}${grouped},${String(absolute % 100n).padStart(2,'0')}`;
}
