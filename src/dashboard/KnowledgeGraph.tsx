// DemirTube · bilgi ve ilgi haritası
//
// Eski sürüm konuları aynı boyutta balonlar olarak diziyordu (boyut formülü
// 8 videoda tavana vuruyordu) ve bağlantıları yalnızca yazı olarak gösteriyordu.
// Burada konular gerçek bir ağ olarak çizilir: düğüm alanı video sayısına,
// dolgu yoğunluğu derinliğe, çizgi kalınlığı ortak video sayısına bağlıdır.
import { useMemo, useState, type CSSProperties } from "react";
import type { KnowledgeMap } from "../analytics/intelligence-hub";
import { formatDuration } from "../shared/utils";

const W = 720;
const H = 440;
const CX = W / 2;
const CY = H / 2;

type Placed = { topic: string; videoCount: number; watchSeconds: number; depth: number; x: number; y: number; r: number; index: number };

export function KnowledgeGraph({ map }: { map: KnowledgeMap }) {
  const [hovered, setHovered] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const focus = hovered ?? selected;

  const { nodes, edges, maxStrength } = useMemo(() => {
    const top = map.nodes.slice(0, 12).toSorted((a, b) => b.videoCount - a.videoCount);
    const maxCount = Math.max(1, ...top.map((node) => node.videoCount));
    const ring = top.slice(1);
    const placed: Placed[] = top.map((node, index) => {
      const r = Math.round(16 + 36 * Math.sqrt(node.videoCount / maxCount));
      if (index === 0) return { ...node, x: CX, y: CY, r: Math.max(r, 44), index };
      // Halka düğümleri elips üzerinde; komşu düğümler çakışmasın diye tek/çift
      // sıradakiler hafifçe içe/dışa kaydırılır.
      const angle = -Math.PI / 2 + ((index - 1) / ring.length) * Math.PI * 2;
      const wobble = ring.length > 7 ? (index % 2 ? 1 : 0.8) : 1;
      return { ...node, x: CX + Math.cos(angle) * 290 * wobble, y: CY + Math.sin(angle) * 172 * wobble, r, index };
    });
    const byTopic = new Map(placed.map((node) => [node.topic, node]));
    const visibleEdges = map.edges
      .filter((edge) => byTopic.has(edge.source) && byTopic.has(edge.target))
      .slice(0, 24);
    return { nodes: placed, edges: visibleEdges.map((edge) => ({ ...edge, a: byTopic.get(edge.source)!, b: byTopic.get(edge.target)! })), maxStrength: Math.max(1, ...visibleEdges.map((edge) => edge.strength)) };
  }, [map]);

  const neighbours = useMemo(() => {
    if (!focus) return undefined;
    const set = new Set([focus]);
    edges.forEach((edge) => { if (edge.source === focus) set.add(edge.target); if (edge.target === focus) set.add(edge.source); });
    return set;
  }, [focus, edges]);

  const active = nodes.find((node) => node.topic === (selected ?? hovered)) ?? nodes[0];
  const activeLinks = active
    ? edges.filter((edge) => edge.source === active.topic || edge.target === active.topic).slice(0, 5)
    : [];
  const byDepth = nodes.toSorted((a, b) => b.depth - a.depth);
  const maxDepth = Math.max(1, ...nodes.map((node) => node.depth));

  if (!nodes.length) return <p className="soft-empty">Konu haritası için henüz yeterli video yok.</p>;

  return (
    <div className="kg">
      <div className="kg-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Konu ağı: ${nodes.map((node) => `${node.topic} ${node.videoCount} video`).join(", ")}`} onClick={() => setSelected(undefined)}>
          <defs>
            <radialGradient id="kg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="kg-fill" cx="32%" cy="28%" r="80%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".95" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity=".35" />
            </radialGradient>
          </defs>
          <circle className="kg-orbit" cx={CX} cy={CY} r={120} />
          <ellipse className="kg-orbit" cx={CX} cy={CY} rx={290} ry={172} />
          <circle cx={CX} cy={CY} r={150} fill="url(#kg-glow)" className="kg-pulse" />

          <g className="kg-edges">
            {edges.map((edge, index) => {
              const mx = (edge.a.x + edge.b.x) / 2;
              const my = (edge.a.y + edge.b.y) / 2;
              // Kontrol noktası merkeze çekilir: çizgiler düğümlerin üstünden değil, içeriden kavis çizer.
              const qx = mx + (CX - mx) * 0.35;
              const qy = my + (CY - my) * 0.35;
              const on = neighbours ? neighbours.has(edge.source) && neighbours.has(edge.target) && (edge.source === focus || edge.target === focus) : false;
              return (
                <path
                  key={`${edge.source}-${edge.target}`}
                  d={`M${edge.a.x},${edge.a.y} Q${qx},${qy} ${edge.b.x},${edge.b.y}`}
                  pathLength={1}
                  className={`kg-edge ${on ? "on" : ""} ${neighbours && !on ? "dim" : ""}`}
                  style={{ "--i": index, strokeWidth: 1 + (edge.strength / maxStrength) * 5 } as CSSProperties}
                />
              );
            })}
          </g>

          <g className="kg-nodes">
            {nodes.map((node) => {
              const dim = neighbours && !neighbours.has(node.topic);
              const isActive = node.topic === selected;
              const inside = node.r >= 30;
              return (
                <g
                  key={node.topic}
                  transform={`translate(${node.x},${node.y})`}
                  className={`kg-node ${dim ? "dim" : ""} ${isActive ? "active" : ""}`}
                  onMouseEnter={() => setHovered(node.topic)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={(event) => { event.stopPropagation(); setSelected((current) => current === node.topic ? undefined : node.topic); }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.topic}: ${node.videoCount} video, derinlik ${node.depth}`}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(node.topic); } }}
                  style={{ "--i": node.index } as CSSProperties}
                >
                  <g className="kg-bob" style={{ "--float": `${5 + (node.index % 4) * 1.3}s` } as CSSProperties}>
                    <circle className="kg-halo" r={node.r + 7} />
                    {/* Derinlik halkası: çemberin ne kadarının dolduğu derinlik puanı */}
                    <circle className="kg-depth-track" r={node.r + 3} />
                    <circle
                      className="kg-depth"
                      r={node.r + 3}
                      pathLength={100}
                      strokeDasharray={`${node.depth} 100`}
                      transform="rotate(-90)"
                    />
                    <circle className="kg-core" r={node.r} fill="url(#kg-fill)" style={{ fillOpacity: 0.35 + (node.depth / maxDepth) * 0.65 }} />
                    {inside ? (
                      <>
                        <text className="kg-label" y={-2}>{node.topic}</text>
                        <text className="kg-count" y={13}>{node.videoCount}</text>
                      </>
                    ) : (
                      <>
                        <text className="kg-count" y={4}>{node.videoCount}</text>
                        <text className="kg-label outside" y={node.r + 18}>{node.topic}</text>
                      </>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="kg-legend">
          <span><i className="kg-legend-size" /> Alan = video sayısı</span>
          <span><i className="kg-legend-ring" /> Halka = derinlik</span>
          <span><i className="kg-legend-line" /> Çizgi = ortak video</span>
        </div>
      </div>

      <aside className="kg-side">
        {active ? (
          <div className="kg-detail" key={active.topic}>
            <small>{selected ? "SEÇİLİ KONU" : "EN BÜYÜK KONU"}</small>
            <h3>{active.topic}</h3>
            <div className="kg-detail-stats">
              <div><b>{active.videoCount}</b><span>video</span></div>
              <div><b>{active.depth}</b><span>derinlik</span></div>
              <div><b>{formatDuration(active.watchSeconds)}</b><span>izleme</span></div>
            </div>
            {activeLinks.length ? (
              <ul>
                {activeLinks.map((edge) => {
                  const other = edge.source === active.topic ? edge.target : edge.source;
                  return (
                    <li key={other}>
                      <button type="button" onClick={() => setSelected(other)}>{other}</button>
                      <span><i style={{ width: `${(edge.strength / maxStrength) * 100}%` }} /></span>
                      <b>{edge.strength}</b>
                    </li>
                  );
                })}
              </ul>
            ) : <p>Bu konu diğerleriyle henüz ortak video paylaşmıyor.</p>}
          </div>
        ) : null}

        <div className="kg-rank">
          <small>DERİNLİK SIRALAMASI</small>
          {byDepth.slice(0, 6).map((node, index) => (
            <button
              type="button"
              key={node.topic}
              className={node.topic === focus ? "on" : ""}
              onMouseEnter={() => setHovered(node.topic)}
              onMouseLeave={() => setHovered(undefined)}
              onClick={() => setSelected(node.topic)}
              style={{ "--i": index } as CSSProperties}
            >
              <span>{node.topic}</span>
              <em><i style={{ width: `${(node.depth / maxDepth) * 100}%` }} /></em>
              <b>{node.depth}</b>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
