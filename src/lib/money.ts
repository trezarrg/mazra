// Operasi UI dalam sen; posting dan pembulatan otoritatif tetap memakai numeric Postgres.
export function cents(value: string | number) {
  const raw = String(value); const sign = raw.startsWith("-") ? BigInt(-1) : BigInt(1);
  const [whole, decimal = ""] = raw.replace(/^-/, "").split(".");
  return sign * (BigInt(whole || "0") * BigInt(100) + BigInt(decimal.padEnd(2, "0").slice(0, 2)));
}
export function fromCents(value: bigint) {
  const digits = (value < BigInt(0) ? -value : value).toString().padStart(3, "0");
  return `${value < BigInt(0) ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function sumMoney(values: (string | number)[]) { return fromCents(values.reduce<bigint>((sum, value) => sum + cents(value), BigInt(0))); }
