import { useEffect, useState } from "react";
import { tankStatus } from "../../lib/tankMath";
import { fuelClass } from "../../lib/fuel.js";
import { money } from "../../lib/format";

/**
 * An underground tank drawn side-on: straight barrel, dished ends, fuel
 * lying flat at its level. The level animates in on first paint and between
 * dips, so a change in stock is something you see happen.
 */
export default function TankVessel({ tank, size = "md" }) {
  const st = tankStatus(tank);
  const cls = fuelClass(tank.fuelType);

  // Fill from empty on first paint so the level reads as a measurement
  // arriving, then animate between levels as dips come in.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(st.fillPercent));
    return () => cancelAnimationFrame(id);
  }, [st.fillPercent]);

  return (
    <div
      className={`tank-vessel tank-vessel--${size} ${st.level}${st.retired ? " retired" : ""}`}
      title={`${money(st.stock)} L of ${money(st.capacity)} L`}
    >
      <div
        className={`tank-vessel__fill tank-fill--${cls}`}
        style={{ height: `${shown}%` }}
      >
        <div className="tank-vessel__surface" />
      </div>
      <div className="tank-vessel__ticks">
        {[25, 50, 75].map((tick) => (
          <i key={tick} style={{ bottom: `${tick}%` }} />
        ))}
      </div>
      <div className="tank-vessel__pct">{Math.round(st.fillPercent)}%</div>
    </div>
  );
}
