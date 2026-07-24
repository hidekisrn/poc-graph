import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { GraphData } from "./api";

interface Props {
  graph: GraphData;
  /** ids das pessoas na resposta atual (destacadas). */
  highlighted: Set<string>;
}

const typeColor: Record<string, string> = {
  continent: "#6366f1",
  country: "#0ea5e9",
  state: "#14b8a6",
  city: "#22c55e",
  neighborhood: "#84cc16",
  person: "#f59e0b",
  company: "#ec4899",
};

const edgeColor: Record<string, string> = {
  WITHIN: "#475569",
  BORN_IN: "#64748b",
  LIVES_IN: "#64748b",
  WORKS_AT: "#ec4899",
  REPORTS_TO: "#a855f7",
  KNOWS: "#f59e0b",
};

export function GraphView({ graph, highlighted }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({ data: n.data })),
      ...graph.edges.map((e) => ({ data: e.data })),
    ];
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 10,
            color: "#e5e7eb",
            "text-valign": "center",
            "text-halign": "right",
            "text-margin-x": 3,
            width: 18,
            height: 18,
            "background-color": (ele: cytoscape.NodeSingular) => typeColor[ele.data("type")] ?? "#94a3b8",
          },
        },
        { selector: 'node[kind = "person"]', style: { shape: "diamond", width: 24, height: 24, "font-size": 12 } },
        { selector: 'node[kind = "company"]', style: { shape: "round-rectangle", width: 22, height: 22 } },
        {
          selector: "node.highlight",
          style: { "border-width": 4, "border-color": "#ef4444", width: 32, height: 32 },
        },
        {
          selector: "edge",
          style: {
            label: "data(label)",
            "font-size": 7,
            color: "#64748b",
            "text-rotation": "autorotate",
            width: 1.2,
            "line-color": (ele: cytoscape.EdgeSingular) => edgeColor[ele.data("label")] ?? "#475569",
            "target-arrow-color": (ele: cytoscape.EdgeSingular) => edgeColor[ele.data("label")] ?? "#475569",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.7,
            "curve-style": "bezier",
          },
        },
        { selector: 'edge[label = "KNOWS"]', style: { width: 2, "line-style": "dashed" } },
        { selector: 'edge[label = "REPORTS_TO"]', style: { width: 2, "line-style": "dotted" } },
      ],
      layout: { name: "cose", animate: false, padding: 24, nodeRepulsion: () => 12000, idealEdgeLength: () => 70 },
    });
    cyRef.current = cy;

    const fit = () => {
      cy.resize();
      cy.fit(undefined, 24);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
    };
  }, [graph]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("highlight");
    highlighted.forEach((id) => cy.getElementById(id).addClass("highlight"));
  }, [highlighted]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#0f172a", borderRadius: 8 }}
    />
  );
}
