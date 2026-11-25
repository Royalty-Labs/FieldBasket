import { useState } from "react";
import { naira, shortDate } from "../lib/format";

type Day = { day: string; amount: number | string; orders: number };

/** Paid takings per day: one series, so no legend; hover shows the day. */
export function RevenueBars({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720,
    H = 180,
    top = 12,
    bottom = 26,
    left = 8,
    right = 8;
  const max = Math.max(1, ...days.map((d) => Number(d.amount)));
  const slot = (W - left - right) / days.length;
  const barW = Math.max(4, slot - 2); // 2px surface gap between bars
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const shown = active === null ? null : days[active];

  return (
    <figure className="rev-chart">
      <div className="rev-chart__readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{naira(shown.amount)}</strong> · {shown.orders}{" "}
            {shown.orders === 1 ? "basket" : "baskets"} ·{" "}
            {shortDate(`${shown.day}T12:00:00Z`)}
          </>
        ) : (
          <>
            Highest day:{" "}
            <strong>
              {naira(
                max === 1 && !days.some((d) => Number(d.amount)) ? 0 : max,
              )}
            </strong>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Paid takings per day for the last 30 days"
        onMouseLeave={() => setActive(null)}
      >
        <line
          x1={left}
          x2={W - right}
          y1={H - bottom}
          y2={H - bottom}
          className="rev-chart__axis"
        />
        {days.map((d, i) => {
          const value = Number(d.amount);
          const x = left + i * slot + (slot - barW) / 2;
          const barTop = y(value);
          const h = Math.max(0, H - bottom - barTop);
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  className={`rev-chart__bar${active === i ? " is-active" : ""}`}
                  d={`M${x} ${H - bottom}V${barTop + Math.min(4, h)}q0 -${Math.min(4, h)} ${Math.min(4, barW / 2)} -${Math.min(4, h)}H${x + barW - Math.min(4, barW / 2)}q${Math.min(4, barW / 2)} 0 ${Math.min(4, barW / 2)} ${Math.min(4, h)}V${H - bottom}z`}
                />
              )}
              {/* Hit target taller and wider than the bar */}
              <rect
                x={left + i * slot}
                y={top}
                width={slot}
                height={H - top - bottom}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                tabIndex={-1}
              >
                <title>{`${d.day}: ${naira(d.amount)}`}</title>
              </rect>
            </g>
          );
        })}
        <text x={left} y={H - 8} className="rev-chart__tick">
          {shortDate(`${days[0]?.day}T12:00:00Z`)}
        </text>
        <text
          x={W - right}
          y={H - 8}
          textAnchor="end"
          className="rev-chart__tick"
        >
          Today
        </text>
      </svg>
      <div className="sr-only">
        <table>
          <caption>Paid takings per day</caption>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{naira(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
