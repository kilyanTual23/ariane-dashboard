"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

import type { PlaceCluster, PlaceEventType } from "@/lib/geo";

export function AncestorsMap({
  slug,
  clusters,
}: {
  slug: string;
  clusters: PlaceCluster[];
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | PlaceEventType>("all");
  const [sosaOnly, setSosaOnly] = useState(false);

  // Filtrer les événements et les clusters
  const filteredClusters = useMemo(() => {
    return clusters
      .map((c) => {
        const matchingEvents = c.events.filter((e) => {
          if (eventTypeFilter !== "all" && e.type !== eventTypeFilter) return false;
          if (sosaOnly && !e.sosa) return false;
          return true;
        });

        if (matchingEvents.length === 0) return null;
        return {
          ...c,
          events: matchingEvents,
        };
      })
      .filter((c): c is PlaceCluster => c !== null);
  }, [clusters, eventTypeFilter, sosaOnly]);

  const activeCluster = useMemo(() => {
    if (!selectedCommune) return null;
    return filteredClusters.find((c) => c.commune === selectedCommune) ?? null;
  }, [filteredClusters, selectedCommune]);

  // Initialisation de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Coordonnées de centrage sur la France (ou Ille-et-Vilaine / Normandie)
        const map = L.map(mapContainerRef.current, {
          center: [48.35, -1.2],
          zoom: 8,
          zoomControl: false,
        });

        L.control.zoom({ position: "bottomright" }).addTo(map);

        // Tuiles CartoDB Positron (élégant, monochrome, sans bruit visuel)
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        markersLayerRef.current = markersLayer;
      }

      // Mise à jour des marqueurs
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;
      if (!map || !markersLayer) return;

      markersLayer.clearLayers();

      const bounds: [number, number][] = [];

      filteredClusters.forEach((cluster) => {
        bounds.push([cluster.lat, cluster.lng]);
        const count = cluster.events.length;
        const radius = Math.min(26, Math.max(12, 10 + Math.sqrt(count) * 4));

        const isSelected = cluster.commune === selectedCommune;

        // Marqueur avec pastille stylisée
        const icon = L.divIcon({
          className: "custom-map-marker",
          html: `
            <div style="
              width: ${radius * 2}px;
              height: ${radius * 2}px;
              background-color: ${isSelected ? "#0d9488" : "rgba(15, 16, 18, 0.85)"};
              color: white;
              border: 2px solid white;
              border-radius: 9999px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: monospace;
              font-size: ${radius > 16 ? "11px" : "10px"};
              font-weight: 600;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
              cursor: pointer;
              transition: transform 0.15s ease;
            ">
              ${count}
            </div>
          `,
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        });

        const marker = L.marker([cluster.lat, cluster.lng], { icon });

        marker.on("click", () => {
          setSelectedCommune(cluster.commune);
          map.panTo([cluster.lat, cluster.lng], { animate: true });
        });

        markersLayer.addLayer(marker);
      });

      // Si bounds disponibles et premier chargement
      if (bounds.length > 0 && !selectedCommune) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [filteredClusters, selectedCommune]);

  const eventIcon = (type: PlaceEventType) => {
    switch (type) {
      case "birth":
        return "👶";
      case "marriage":
        return "💍";
      case "death":
        return "⚰️";
    }
  };

  const eventLabel = (type: PlaceEventType) => {
    switch (type) {
      case "birth":
        return "Naissance";
      case "marriage":
        return "Mariage";
      case "death":
        return "Décès";
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Barre de contrôle et filtres */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-soft">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-fg-subtle mr-1">Événements :</span>
          <button
            type="button"
            onClick={() => setEventTypeFilter("all")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              eventTypeFilter === "all"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            Tous ({clusters.reduce((acc, c) => acc + c.events.length, 0)})
          </button>
          <button
            type="button"
            onClick={() => setEventTypeFilter("birth")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              eventTypeFilter === "birth"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            👶 Naissances
          </button>
          <button
            type="button"
            onClick={() => setEventTypeFilter("marriage")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              eventTypeFilter === "marriage"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            💍 Mariages
          </button>
          <button
            type="button"
            onClick={() => setEventTypeFilter("death")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              eventTypeFilter === "death"
                ? "bg-surface-3 font-medium text-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            ⚰️ Décès
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sosaOnly}
              onChange={(e) => setSosaOnly(e.target.checked)}
              className="rounded border-border"
            />
            <span>⭐ Sosa uniquement</span>
          </label>
        </div>
      </div>

      {/* Grille principale : Carte + Panneau latéral des communes */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Conteneur de la carte Leaflet */}
        <div className="relative min-h-[550px] overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />

          {/* Badge récapitulatif en haut à gauche */}
          <div className="absolute top-3.5 left-3.5 z-10 rounded-xl border border-border/80 bg-surface/90 backdrop-blur px-3 py-1.5 text-xs text-fg-muted shadow-soft">
            <strong className="text-fg font-semibold">{filteredClusters.length}</strong> communes géolocalisées ·{" "}
            <strong className="text-fg font-semibold">
              {filteredClusters.reduce((acc, c) => acc + c.events.length, 0)}
            </strong>{" "}
            actes
          </div>
        </div>

        {/* Panneau latéral : Détails de la commune sélectionnée ou palmarès */}
        <div className="flex flex-col gap-4">
          {activeCluster ? (
            <div className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-fg">
                    {activeCluster.commune}
                  </h2>
                  <p className="text-xs text-fg-subtle truncate mt-0.5">{activeCluster.fullName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCommune(null)}
                  className="rounded-lg p-1 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg"
                  title="Fermer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
                <span>
                  <strong className="font-semibold text-fg">{activeCluster.events.length}</strong> événement(s)
                </span>
                <span className="text-[11px] text-fg-subtle font-mono">
                  {activeCluster.lat.toFixed(3)}, {activeCluster.lng.toFixed(3)}
                </span>
              </div>

              <div className="mt-3 max-h-[440px] overflow-y-auto divide-y divide-border/60">
                {activeCluster.events.map((e, idx) => (
                  <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5 text-xs">
                    <span className="text-sm shrink-0 mt-0.5" title={eventLabel(e.type)}>
                      {eventIcon(e.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/p/${slug}/personnes/${e.personId}`}
                        className="font-medium text-fg underline-offset-2 hover:underline"
                      >
                        {e.personName}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-fg-subtle">
                        <span>{eventLabel(e.type)}</span>
                        {e.year && <span className="num font-medium text-fg-muted">{e.year}</span>}
                        {e.sosa && (
                          <span className="rounded bg-fg/10 px-1 font-mono text-[10px] text-fg">
                            Sosa {e.sosa}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-card">
              <h2 className="text-sm font-semibold text-fg tracking-tight mb-1">
                Principaux foyers géographiques
              </h2>
              <p className="text-xs text-fg-muted mb-3">
                Cliquez sur une commune pour afficher ses actes et centrer la carte.
              </p>

              <div className="max-h-[480px] overflow-y-auto divide-y divide-border/60">
                {filteredClusters.slice(0, 15).map((c) => (
                  <button
                    key={c.commune}
                    type="button"
                    onClick={() => {
                      setSelectedCommune(c.commune);
                      mapInstanceRef.current?.panTo([c.lat, c.lng], { animate: true });
                    }}
                    className="flex w-full items-center justify-between py-2.5 px-1.5 text-left text-xs transition-colors hover:bg-surface-2 rounded-xl"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="font-medium text-fg block truncate">{c.commune}</span>
                      <span className="text-[11px] text-fg-subtle truncate block">
                        {c.fullName.split(",")[1]?.trim() || "France"}
                      </span>
                    </div>
                    <span className="num font-semibold text-xs text-fg-muted rounded-full bg-surface-3 px-2 py-0.5">
                      {c.events.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

