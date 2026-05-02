import streamDeck, {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("KrakenPriceTicker");

// ─── Types ───────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface KrakenPriceSettings {
  pair: string;
  refreshSeconds: number;
  showLabel: boolean;
  decimals: number;
  [key: string]: JsonValue;
}

const DEFAULT_SETTINGS: KrakenPriceSettings = {
  pair: "SOLUSD",
  refreshSeconds: 30,
  showLabel: true,
  decimals: 2,
};

// ─── Kraken API types ─────────────────────────────────────────────────────────

interface KrakenTickerResult {
  c: [string, string]; // last trade closed: [price, lot volume]
}

interface KrakenResponse {
  error: string[];
  result: Record<string, KrakenTickerResult>;
}

// ─── Per-instance runtime state ───────────────────────────────────────────────

interface InstanceState {
  settings: KrakenPriceSettings;
  timer: number | null;
  lastPrice: string | null;
  lastError: boolean;
}

// ─── Action ───────────────────────────────────────────────────────────────────

@action({ UUID: "com.raymond.krakenprice.ticker" })
export class KrakenPriceTicker extends SingletonAction {
  private readonly instances = new Map<string, InstanceState>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const ctx = ev.action.id;
    const settings = this.resolveSettings(ev.payload.settings as Partial<KrakenPriceSettings>);
    logger.info(`[${ctx}] Appear — pair=${settings.pair} interval=${settings.refreshSeconds}s`);
    this.instances.set(ctx, { settings, timer: null, lastPrice: null, lastError: false });
    await this.fetchAndUpdate(ctx);
    this.startPolling(ctx);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    const ctx = ev.action.id;
    logger.info(`[${ctx}] Disappear — stopping timer`);
    this.stopPolling(ctx);
    this.instances.delete(ctx);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    const ctx = ev.action.id;
    const settings = this.resolveSettings(ev.payload.settings as Partial<KrakenPriceSettings>);
    logger.info(`[${ctx}] Settings — pair=${settings.pair} interval=${settings.refreshSeconds}s`);
    const state = this.instances.get(ctx);
    if (!state) return;
    state.settings = settings;
    this.stopPolling(ctx);
    await this.fetchAndUpdate(ctx);
    this.startPolling(ctx);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    logger.info(`[${ev.action.id}] Key pressed — forcing refresh`);
    await this.fetchAndUpdate(ev.action.id);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private resolveSettings(raw: Partial<KrakenPriceSettings>): KrakenPriceSettings {
    return {
      pair: ((raw.pair as string | undefined) ?? DEFAULT_SETTINGS.pair).toUpperCase().trim(),
      refreshSeconds: Math.max(10, Number(raw.refreshSeconds ?? DEFAULT_SETTINGS.refreshSeconds)),
      showLabel: raw.showLabel !== undefined ? Boolean(raw.showLabel) : DEFAULT_SETTINGS.showLabel,
      decimals: Math.min(8, Math.max(0, Number(raw.decimals ?? DEFAULT_SETTINGS.decimals))),
    };
  }

  private startPolling(ctx: string): void {
    const state = this.instances.get(ctx);
    if (!state) return;
    state.timer = globalThis.setInterval(() => {
      void this.fetchAndUpdate(ctx);
    }, state.settings.refreshSeconds * 1000) as unknown as number;
  }

  private stopPolling(ctx: string): void {
    const state = this.instances.get(ctx);
    if (!state?.timer) return;
    globalThis.clearInterval(state.timer);
    state.timer = null;
  }

  private async fetchAndUpdate(ctx: string): Promise<void> {
    const state = this.instances.get(ctx);
    if (!state) return;

    const { pair, showLabel, decimals } = state.settings;
    const act = streamDeck.actions.getActionById(ctx);
    if (!act) return;

    try {
      const url = `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`;
      const response = await globalThis.fetch(url, {
        headers: { Accept: "application/json" },
        signal: (globalThis.AbortSignal as typeof AbortSignal).timeout(8000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as KrakenResponse;
      if (data.error?.length) throw new Error(data.error.join(", "));

      const keys = Object.keys(data.result);
      if (keys.length === 0) throw new Error("Empty result from Kraken");

      const rawPrice = parseFloat(data.result[keys[0]].c[0]);
      if (isNaN(rawPrice)) throw new Error("Non-numeric price");

      const formatted = formatPrice(rawPrice, decimals);
      state.lastPrice = formatted;
      state.lastError = false;

      const lines: string[] = [];
      if (showLabel) lines.push(pair);
      lines.push(formatted);
      await act.setTitle(lines.join("\n"));

    } catch (err) {
      state.lastError = true;
      logger.error(`[${ctx}] Error fetching ${pair}: ${err instanceof Error ? err.message : String(err)}`);
      await act.setTitle(`${showLabel ? pair + "\n" : ""}ERR`);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number, requested: number): string {
  if (price < 0.01 && requested < 6) return price.toFixed(6);
  if (price < 1    && requested < 4) return price.toFixed(4);
  return price.toFixed(requested);
}