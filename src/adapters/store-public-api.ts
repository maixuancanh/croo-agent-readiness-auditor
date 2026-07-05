import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sha256Hex } from "../services/hash.js";

export interface StoreSnapshot {
  snapshotId: string;
  fetchedAt: string;
  degraded: boolean;
  notes: string[];
  platformStats: Record<string, unknown>;
  agents: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  leaderboard: Array<Record<string, unknown>>;
  search: Array<Record<string, unknown>>;
  sourceCoverage: {
    platformStats: boolean;
    agents: boolean;
    services: boolean;
    leaderboard: boolean;
    search: boolean;
    marketSamples: boolean;
  };
}

const defaultBaseUrl = "https://api.croo.network/backend/v1/public";
const cachePath = "out/cache/croo-store-readiness-snapshot.json";

const fixtureSnapshot = {
  platformStats: {
    totalAgents: 128,
    totalServices: 216,
    totalOrders: 940,
    totalVolumeUsdc: 18420,
    topCategories: ["developer tooling", "research", "verification", "defi"]
  },
  agents: [
    { name: "Research Desk", skills: ["research", "market intelligence"], orders: 47, volumeUsdc: 840 },
    { name: "BUIDL Scout Agent", skills: ["hackathon", "research"], orders: 31, volumeUsdc: 465 },
    { name: "CAP Synthetic Order Harness", skills: ["developer tooling", "CAP"], orders: 24, volumeUsdc: 510 },
    { name: "DataScout", skills: ["data", "verification"], orders: 29, volumeUsdc: 620 }
  ],
  services: [
    { name: "market_research_report", category: "research", priceUsdc: 8, orders: 41 },
    { name: "agent_readiness_audit", category: "verification", priceUsdc: 1, orders: 9 },
    { name: "cap_readiness_check", category: "developer tooling", priceUsdc: 6, orders: 24 },
    { name: "reward_eligibility_audit", category: "verification", priceUsdc: 10, orders: 18 }
  ],
  leaderboard: [
    { name: "Research Desk", dimension: "orders", value: 47 },
    { name: "DataScout", dimension: "volume", value: 620 },
    { name: "CAP Synthetic Order Harness", dimension: "completion", value: 0.96 }
  ],
  search: [
    { name: "BUIDL Scout Agent", type: "agent", match: "hackathon research" },
    { name: "market_research_report", type: "service", match: "research report" },
    { name: "agent_readiness_audit", type: "service", match: "agent readiness audit" }
  ]
};

export class StorePublicApi {
  constructor(private readonly baseUrl = process.env.CROO_PUBLIC_API_URL ?? defaultBaseUrl) {}

  async getSnapshot(options: { query: string; useLiveStore?: boolean }): Promise<StoreSnapshot> {
    if (!options.useLiveStore) {
      return this.fromFixture(["Live Store fetch disabled; using deterministic local fixture."]);
    }

    try {
      const [platformStats, agents, services, leaderboard, search, serviceDetail] = await Promise.all([
        this.getJson<Record<string, unknown>>("/platform-stats"),
        this.getJson<{ agents?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>(
          "/agents?page=1&page_size=100"
        ),
        this.getJson<{ data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>("/services?page=1&page_size=100"),
        this.getJson<{ data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>("/leaderboard?dimension=orders&limit=50"),
        this.getJson<{ data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>(
          `/search?q=${encodeURIComponent(options.query)}&page=1&page_size=50`
        ),
        this.fetchServiceDetail(options.query)
      ]);
      const serviceItems = this.pickList(services);
      if (serviceDetail && !serviceItems.some((service) => service.serviceId === serviceDetail.serviceId)) {
        serviceItems.push(serviceDetail);
      }

      return this.withMetadata({
        degraded: false,
        notes: ["Fetched public CROO Store endpoints."],
        platformStats,
        agents: this.pickList(agents),
        services: serviceItems,
        leaderboard: this.pickList(leaderboard),
        search: this.pickList(search),
        sourceCoverage: {
          platformStats: true,
          agents: true,
          services: true,
          leaderboard: true,
          search: true,
          marketSamples: true
        }
      });
    } catch (error) {
      const cached = await this.readCache();
      if (cached) {
        return { ...cached, degraded: true, notes: [`Public Store fetch failed; using cached snapshot. ${String(error)}`] };
      }
      return this.fromFixture([`Public Store fetch failed; using deterministic local fixture. ${String(error)}`]);
    }
  }

  async writeCache(snapshot: StoreSnapshot): Promise<void> {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      throw new Error(`${path} returned ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async fetchServiceDetail(query: string): Promise<Record<string, unknown> | undefined> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
      return undefined;
    }

    try {
      const detail = await this.getJson<{ service?: Record<string, unknown> }>(`/services/${query}`);
      return detail.service;
    } catch {
      return undefined;
    }
  }

  private pickList(value: {
    agents?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
  }): Array<Record<string, unknown>> {
    return value.agents ?? value.data ?? value.items ?? [];
  }

  private async readCache(): Promise<StoreSnapshot | undefined> {
    try {
      return JSON.parse(await readFile(cachePath, "utf8")) as StoreSnapshot;
    } catch {
      return undefined;
    }
  }

  private async fromFixture(notes: string[]): Promise<StoreSnapshot> {
    return this.withMetadata({
      degraded: true,
      notes,
      ...fixtureSnapshot,
      sourceCoverage: {
        platformStats: true,
        agents: true,
        services: true,
        leaderboard: true,
        search: true,
        marketSamples: true
      }
    });
  }

  private async withMetadata(input: Omit<StoreSnapshot, "snapshotId" | "fetchedAt">): Promise<StoreSnapshot> {
    const fetchedAt = new Date().toISOString();
    const snapshotId = sha256Hex({ fetchedAt, input }).slice(0, 24);
    const snapshot = { snapshotId, fetchedAt, ...input };
    await this.writeCache(snapshot);
    return snapshot;
  }
}
