function luminance(hex: string): number {
  const components = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return (
    components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722
  );
}
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function accessibleAccent(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "#acd5bd";
  const channels = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  for (let step = 0; step <= 20; step++) {
    const mixed =
      "#" +
      channels
        .map((channel) =>
          Math.round(channel + ((255 - channel) * step) / 20)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (contrast(mixed, "#1e2421") >= 4.5 && contrast(mixed, "#151918") >= 4.5)
      return mixed;
  }
  return "#acd5bd";
}
