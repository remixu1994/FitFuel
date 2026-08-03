"use client";
import { useId, useState, type ReactNode } from "react";
import styles from "./LineChart.module.css";

export type LineChartDatum = {
  key: string;
  label: string;      // x 轴短标签（如 07/13）
  title: string;      // 提示框第一行（如 07/13 · 3 次活动）
  valueText: string;  // 提示框数值部分（如 1234.56）
  unit: string;       // 提示框单位部分（如 kcal / kg）
  value: number;      // y 轴数值
};

function formatAxisValue(value: number) {
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return value.toFixed(1);
}

export default function LineChart({
  data,
  color = "#16a65d",
  height = 270,
  empty,
  maxLabels = 7,
  autoScale = false,
  yUnit
}: {
  data: LineChartDatum[];
  color?: string;
  height?: number;
  empty?: ReactNode;
  maxLabels?: number;
  /** true 时按数据最小/最大值自动缩放 Y 轴（适合体重这类波动很小的指标） */
  autoScale?: boolean;
  /** Y 轴顶部单位（如 kg / kcal） */
  yUnit?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId().replace(/[:]/g, "");
  if (!data.length) return <div className={styles.empty}>{empty ?? "暂无数据"}</div>;

  const width = 1000, padLeft = 58, padRight = 26, padTop = 20, padBottom = 38;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Y 轴范围
  let yMin = 0;
  let yMax = Math.max(100, ...data.map(item => item.value));
  if (autoScale) {
    const values = data.map(item => item.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (lo === hi) {
      const margin = Math.max(0.5, Math.abs(lo) * 0.05);
      yMin = lo - margin;
      yMax = hi + margin;
    } else {
      const margin = (hi - lo) * 0.18;
      yMin = lo - margin;
      yMax = hi + margin;
    }
    if (yMin < 0) yMin = 0;
  }
  const ySpan = Math.max(yMax - yMin, 0.0001);

  const points = data.map((item, index) => ({
    x: data.length === 1 ? width / 2 : padLeft + index * plotWidth / (data.length - 1),
    y: padTop + (yMax - item.value) / ySpan * plotHeight
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L${points.at(-1)?.x},${height - padBottom} L${points[0].x},${height - padBottom} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const hitWidth = plotWidth / Math.max(1, data.length - 1);
  const tooltipWidth = 176, tooltipHeight = 56;
  const hoveredPoint = hovered === null ? null : points[hovered];
  const tooltipX = hoveredPoint === null ? 0 : Math.min(width - tooltipWidth / 2 - 8, Math.max(tooltipWidth / 2 + 8, hoveredPoint.x));
  const tooltipBelow = hoveredPoint !== null && hoveredPoint.y < padTop + tooltipHeight + 16;
  const tooltipY = hoveredPoint === null ? 0 : (tooltipBelow ? hoveredPoint.y + 15 : hoveredPoint.y - tooltipHeight - 15);

  return <div className={styles.chart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="趋势图">
      <defs><linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".22"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3].map(index => {
        const y = padTop + index * plotHeight / 3;
        const value = yMax - index * (yMax - yMin) / 3;
        return <g key={index}>
          <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e7eeea" strokeDasharray="4 7"/>
          <text x={padLeft - 10} y={y + 3} textAnchor="end" className={styles.axisLabel}>{formatAxisValue(value)}</text>
        </g>;
      })}
      {yUnit && <text x={padLeft - 10} y={12} textAnchor="end" className={styles.axisUnit}>{yUnit}</text>}
      <path d={area} fill={`url(#${gradientId}-area)`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point, index) => <g key={data[index].key} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} className={styles.point}>
        <rect x={Math.max(padLeft, point.x - hitWidth / 2)} y={padTop} width={Math.min(width - padRight, point.x + hitWidth / 2) - Math.max(padLeft, point.x - hitWidth / 2)} height={plotHeight}/>
        <circle cx={point.x} cy={point.y} r={hovered === index ? 7 : 4} fill="#fff" stroke={color} strokeWidth="3"/>
        {(index % labelStep === 0 || index === data.length - 1) && <text x={point.x} y={height - 9} textAnchor="middle">{data[index].label}</text>}
      </g>)}
      {hovered !== null && hoveredPoint && <g className={styles.tooltipSvg} transform={`translate(${tooltipX - tooltipWidth / 2} ${tooltipY})`}>
        <rect width={tooltipWidth} height={tooltipHeight} rx="10"/>
        <text x="13" y="19" className={styles.tooltipDate}>{data[hovered].title}</text>
        <text x="13" y="43" className={styles.tooltipValue}>{data[hovered].valueText}<tspan> {data[hovered].unit}</tspan></text>
        <path d={tooltipBelow ? `M ${tooltipWidth / 2 - 7} 0 L ${tooltipWidth / 2} -7 L ${tooltipWidth / 2 + 7} 0 Z` : `M ${tooltipWidth / 2 - 7} ${tooltipHeight} L ${tooltipWidth / 2} ${tooltipHeight + 7} L ${tooltipWidth / 2 + 7} ${tooltipHeight} Z`}/>
      </g>}
    </svg>
  </div>;
}
