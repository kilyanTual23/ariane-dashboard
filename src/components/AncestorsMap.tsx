"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

import { IconArrowLeft, IconMapPin, IconSearch, IconStar, IconX } from "@/components/icons";
import { Toggle } from "@/components/Toggle";
import { Badge, buttonClass } from "@/components/ui";
import type { PlaceCluster, PlaceEventType } from "@/lib/geo";
import { normalize } from "@/lib/search";

const EVENT_LABEL: Record<PlaceEventType, string> = {
  birth: "Naissance",
  marriage: "Mariage",
  death: "Décès",
};

const EVENT_DOT: Record<PlaceEventType, string> = {
  birth: "bg-ok-dot",
  marriage: "bg-info-dot",
  death: "bg-fg-subtle",
};

/** Couleurs des marqueurs : les mêmes que les pastilles des filtres. */
const EVENT_COLOR: Record<PlaceEventType, string> = {
  birth: "var(--ok-dot)",
  marriage: "var(--info-dot)",
  death: "var(--fg-subtle)",
};

/** Anneau découpé par type d'événement : la légende se lit directement sur la carte. */
function ringOf(events: { type: PlaceEventType }[]) {
  const order: PlaceEventType[] = ["birth", "marriage", "death"];
  const total = events.length || 1;
  let at = 0;
  const stops = order
    .map((t) => {
      const n = events.filter((e) => e.type === t).length;
      if (!n) return null;
      const from = at;
      at += (n / total) * 100;
      return `${EVENT_COLOR[t]} ${from}% ${at}%`;
    })
    .filter(Boolean);
  return `conic-gradient(${stops.join(", ")})`;
}

// Tuiles OpenStreetMap libres ; le thème sombre est obtenu par filtre CSS (globals.css).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function AncestorsMap({ slug, clusters }: { slug: string; clusters: PlaceCluster[] }) {
  const container = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [eventType, setEventType] = useState<"all" | PlaceEventType>("all");
  const [sosaOnly, setSosaOnly] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      clusters
        .map((c) => ({
          ...c,
          events: c.events.filter((e) => (eventType === "all" || e.type === eventType) && (!sosaOnly || e.sosa)),
        }))
        .filter((c) => c.events.length > 0)
        .sort((a, b) => b.events.length - a.events.length),
    [clusters, eventType, sosaOnly],
  );

  const active = selected ? (filtered.find((c) => c.commune === selected) ?? null) : null;
  const totalEvents = filtered.reduce((n, c) => n + c.events.length, 0);
  const listed = query.trim()
    ? filtered.filter((c) => normalize(`${c.commune} ${c.fullName}`).includes(normalize(query)))
    : filtered;

  // Création de la carte, une seule fois.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;
      leaflet.current = L;
      map.current = L.map(container.current, { center: [48.35, -1.2], zoom: 8, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map.current);
      L.tileLayer(TILE_URL, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map.current);
      markers.current = L.layerGroup().addTo(map.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Marqueurs : un cercle par commune, taille selon le nombre d'événements.
  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !map.current || !markers.current) return;
    markers.current.clearLayers();
    const bounds: [number, number][] = [];

    // Cadrage sur le cœur de la famille : les communes qui réunissent 80 % des événements.
    const totalCount = filtered.reduce((n, c) => n + c.events.length, 0);
    let covered = 0;
    for (const cluster of filtered) {
      if (covered >= totalCount * 0.8 && bounds.length >= 2) break;
      bounds.push([cluster.lat, cluster.lng]);
      covered += cluster.events.length;
    }

    for (const cluster of filtered) {
      const count = cluster.events.length;
      const r = Math.round(Math.min(22, Math.max(11, 9 + Math.sqrt(count) * 3.2)));
      const isSelected = cluster.commune === selected;
      const inner = isSelected
        ? "background:var(--accent);color:var(--accent-fg)"
        : "background:var(--surface);color:var(--fg)";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:9999px;padding:3px;background:${ringOf(cluster.events)};box-shadow:0 0 0 1.5px var(--surface),0 2px 8px rgb(0 0 0 / .25);cursor:pointer"><div style="width:100%;height:100%;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:600 ${r > 15 ? 11 : 10}px/1 var(--font-inter),system-ui,sans-serif;font-variant-numeric:tabular-nums;${inner}">${count}</div></div>`,
        iconSize: [r * 2, r * 2],
        iconAnchor: [r, r],
      });
      // Les communes les plus fournies passent devant leurs voisines.
      const marker = L.marker([cluster.lat, cluster.lng], {
        icon,
        title: `${cluster.commune} · ${count}`,
        zIndexOffset: count * 10 + (isSelected ? 10000 : 0),
      });
      marker.on("click", () => {
        setSelected(cluster.commune);
        map.current?.panTo([cluster.lat, cluster.lng], { animate: true });
      });
      markers.current.addLayer(marker);
    }

    // On recadre quand les filtres changent, pas à chaque sélection.
    const key = `${eventType}|${sosaOnly}`;
    if (bounds.length && fitted.current !== key) {
      fitted.current = key;
      map.current.fitBounds(bounds, { padding: [56, 56], maxZoom: 10 });
    }
  }, [ready, filtered, selected, eventType, sosaOnly]);

  const focus = (c: PlaceCluster) => {
    setSelected(c.commune);
    map.current?.flyTo([c.lat, c.lng], Math.max(map.current.getZoom(), 10), { duration: 0.6 });
  };

  const types: ["all" | PlaceEventType, string][] = [
    ["all", "Tous"],
    ["birth", "Naissances"],
    ["marriage", "Mariages"],
    ["death", "Décès"],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative h-[min(72vh,44rem)] min-h-[26rem] overflow-hidden rounded-xl border border-border bg-surface-2 shadow-xs">
        <div ref={container} className="absolute inset-0 z-0" />

        <div className="absolute left-3 top-3 z-[500] flex flex-wrap items-center gap-2">
          <div className="flex h-8 items-center rounded-lg border border-border bg-surface/95 p-0.5 shadow-card backdrop-blur" role="radiogroup" aria-label="Événements">
            {types.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={eventType === key}
                onClick={() => setEventType(key)}
                className={`flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
                  eventType === key ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {key !== "all" && <span className={`size-1.5 rounded-full ${EVENT_DOT[key]}`} />}
                {label}
              </button>
            ))}
          </div>
          <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface/95 px-2.5 text-xs shadow-card backdrop-blur">
            <IconStar size={13} className="text-fg-subtle" />
            Sosa uniquement
            <Toggle checked={sosaOnly} onChange={setSosaOnly} label="Ancêtres directs uniquement" />
          </label>
        </div>
      </div>

      <aside className="flex max-h-[min(72vh,44rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        {active ? (
          <>
            <header className="border-b border-border p-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-2 flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
              >
                <IconArrowLeft size={12} />
                Toutes les communes
              </button>
              <h2 className="text-base font-semibold tracking-tight">{active.commune}</h2>
              <p className="truncate text-xs text-fg-subtle">{active.fullName}</p>
              <p className="mt-2 text-ui text-fg-muted">
                <span className="num font-semibold text-fg">{active.events.length}</span> événement
                {active.events.length > 1 ? "s" : ""}
              </p>
            </header>
            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {[...active.events]
                .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
                .map((e, i) => (
                  <li key={`${e.personId}-${e.type}-${i}`}>
                    <Link
                      href={`/p/${slug}/personnes/${e.personId}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
                    >
                      <span className={`size-2 shrink-0 rounded-full ${EVENT_DOT[e.type]}`} title={EVENT_LABEL[e.type]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium">{e.personName}</span>
                        <span className="block text-xs text-fg-subtle">
                          {EVENT_LABEL[e.type]}
                          {e.dateRaw ? ` · ${e.dateRaw}` : e.year ? ` · ${e.year}` : ""}
                        </span>
                      </span>
                      {e.sosa && <Badge>#{e.sosa}</Badge>}
                    </Link>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <header className="border-b border-border p-4">
              <h2 className="text-sm font-semibold">Communes</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">
                <span className="num">{filtered.length}</span> communes · <span className="num">{totalEvents}</span> événements
              </p>
              <div className="relative mt-3">
                <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="field pl-8 pr-7"
                  placeholder="Chercher une commune…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Chercher une commune"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Effacer"
                    className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2"
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>
            </header>
            <ul className="flex-1 overflow-y-auto p-1.5">
              {listed.map((c) => (
                <li key={c.commune}>
                  <button
                    type="button"
                    onClick={() => focus(c)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <IconMapPin size={14} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-medium">{c.commune}</span>
                      <span className="block truncate text-2xs text-fg-subtle">
                        {c.fullName.split(",").slice(1).join(",").trim() || "France"}
                      </span>
                    </span>
                    <span className="num rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-medium text-fg-muted">
                      {c.events.length}
                    </span>
                  </button>
                </li>
              ))}
              {listed.length === 0 && (
                <li className="px-3 py-8 text-center text-ui text-fg-subtle">
                  Aucune commune.
                  {query && (
                    <button type="button" onClick={() => setQuery("")} className={buttonClass("quiet", "mt-2", "sm")}>
                      Effacer la recherche
                    </button>
                  )}
                </li>
              )}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
