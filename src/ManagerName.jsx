export default function ManagerName({ name, color }) {
  return (
    <>
      <span className="mgr-dot" style={{ backgroundColor: color }} aria-hidden="true" />
      {name}
    </>
  )
}

// Manager name with their team name underneath, as used in the score tables.
export function ManagerCell({ name, team, color }) {
  return (
    <div className="mgr-cell">
      <span className="mgr-name">
        <ManagerName name={name} color={color} />
      </span>
      <span className="mgr-team">{team}</span>
    </div>
  )
}

export function RankMove({ move }) {
  if (!move) return null
  return move > 0 ? (
    <span className="move move-up" title={`Up ${move} since last gameweek`}>▲{move}</span>
  ) : (
    <span className="move move-down" title={`Down ${-move} since last gameweek`}>▼{-move}</span>
  )
}
