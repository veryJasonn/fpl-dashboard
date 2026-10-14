import ManagerName from './ManagerName.jsx'

export default function Awards({ awards, colors }) {
  if (awards.length === 0) return null
  return (
    <>
      <h2>Season Awards</h2>
      <div className="award-grid">
        {awards.map((award) => (
          <section key={award.key} className="award-card">
            <p className="award-title">{award.title}</p>
            <p className="award-value">{award.value}</p>
            {award.winners.map((w) => (
              <p key={`${w.manager}-${w.note}`} className="award-winner">
                <ManagerName name={w.manager} color={colors.get(w.manager)} />
                <span className="award-note">{w.note}</span>
              </p>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
