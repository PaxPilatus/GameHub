import React from "react";

import type { ComedyAxisKey, ComedyProfile } from "./character-models.js";
import { COMEDY_AXIS_KEYS, COMEDY_AXIS_LABELS_DE } from "./character-models.js";

function radarPoint(
  center: number,
  radius: number,
  index: number,
  total: number,
  value: number,
): { x: number; y: number } {
  const angle = (-Math.PI / 2 + (2 * Math.PI * index) / total);
  const distance = radius * (0.2 + value * 0.78);
  return {
    x: center + distance * Math.cos(angle),
    y: center + distance * Math.sin(angle),
  };
}

export function ComedyRadarChart(props: {
  ariaLabel: string;
  className?: string;
  profile: ComedyProfile;
  size: "compact" | "large";
}): React.JSX.Element {
  const sizePx = props.size === "large" ? 220 : 112;
  const center = sizePx / 2;
  const radius = sizePx * 0.36;
  const total = COMEDY_AXIS_KEYS.length;

  const points = COMEDY_AXIS_KEYS.map((key, index) =>
    radarPoint(center, radius, index, total, props.profile[key]),
  );
  const polygonPoints = points.map((point) => `${String(point.x)},${String(point.y)}`).join(" ");

  const labelRadius = radius * 1.18;
  const labels = COMEDY_AXIS_KEYS.map((key: ComedyAxisKey, index: number) => {
    const position = radarPoint(center, labelRadius, index, total, 1);
    return {
      key,
      label: COMEDY_AXIS_LABELS_DE[key],
      x: position.x,
      y: position.y,
    };
  });

  return (
    <svg
      aria-label={props.ariaLabel}
      className={props.className}
      height={sizePx}
      role="img"
      viewBox={`0 0 ${String(sizePx)} ${String(sizePx)}`}
      width={sizePx}
    >
      <title>{props.ariaLabel}</title>
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon
          key={fraction}
          fill="none"
          points={COMEDY_AXIS_KEYS.map((_, index) => {
            const vertex = radarPoint(center, radius * fraction, index, total, 1);
            return `${String(vertex.x)},${String(vertex.y)}`;
          }).join(" ")}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      ))}
      {COMEDY_AXIS_KEYS.map((_, index) => {
        const outer = radarPoint(center, radius, index, total, 1);
        return (
          <line
            key={index}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={1}
            x1={center}
            x2={outer.x}
            y1={center}
            y2={outer.y}
          />
        );
      })}
      <polygon
        fill="currentColor"
        fillOpacity={0.18}
        points={polygonPoints}
        stroke="currentColor"
        strokeOpacity={0.85}
        strokeWidth={1.5}
      />
      {labels.map((entry) => (
        <text
          fill="currentColor"
          fillOpacity={0.85}
          fontSize={props.size === "large" ? 10 : 8}
          key={entry.key}
          textAnchor="middle"
          x={entry.x}
          y={entry.y}
        >
          {entry.label}
        </text>
      ))}
    </svg>
  );
}
