export function formatTime(epochSeconds: number, timeZone: string): string {
  const date = new Date(epochSeconds * 1000);
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };

  try {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const [intPart, decPart] = value.toFixed(2).split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${formatted}.${decPart}`;
}

export function formatTimeframe(timeframe: string): string {
  const minutes = Number(timeframe);
  if (Number.isFinite(minutes)) {
    if (minutes % 60 === 0) {
      return `${minutes / 60}H`;
    }
    return `${minutes}m`;
  }

  return timeframe.toUpperCase();
}
