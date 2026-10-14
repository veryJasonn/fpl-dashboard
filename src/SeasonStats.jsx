import ManagerName from './ManagerName.jsx'
import Sparkline from './Sparkline.jsx'
import { CHIP_COLORS } from './chips.js'
import { byManagerName } from './managers.js'
import { chipStatus, seasonTotals } from './stats.js'

export default function SeasonStats({ rows, gameweeks, chips, event, colors }) {
  const ordered = [...rows].sort(byManagerName)
  return (
    <>
      <h2>Season Totals</h2>
      <div className="table-scroll">
        <table className="season">
          <thead>
            <tr>
              <th>Manager</th>
              <th className="num">Transfers</th>
              <th className="num">Hits</th>
              <th className="num">Bench pts</th>
              <th>Chips left</th>
              <th>Weekly form</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const totals = seasonTotals(row)
              const color = colors.get(row.manager)
              const form = gameweeks.map((gw) => row.gwPoints[gw]).filter((v) => v !== undefined)
              return (
                <tr key={row.id}>
                  <td><ManagerName name={row.manager} color={color} /></td>
                  <td className="num">{totals.transfers}</td>
                  <td className="num">{totals.hits > 0 ? `−${totals.hits}` : 0}</td>
                  <td className="num">{totals.bench}</td>
                  <td>
                    <span className="chip-row">
                      {chipStatus(row, chips, event).map((chip) =>
                        chip.open || chip.used ? (
                          <span
                            key={chip.code}
                            className={`chip-badge${chip.used ? ' chip-used' : ''}`}
                            style={{ backgroundColor: chip.used ? undefined : CHIP_COLORS[chip.code] }}
                            title={chip.used ? `${chip.code} played in GW${chip.usedAt}` : `${chip.code} still available`}
                          >
                            {chip.code}
                          </span>
                        ) : null,
                      )}
                    </span>
                  </td>
                  <td><Sparkline values={form} color={color} label={`${row.manager} weekly points`} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="table-note">Chips left shows this half of the season (chips refresh at GW20). Greyed-out chips are already played. Hits are transfer-penalty points.</p>
    </>
  )
}
