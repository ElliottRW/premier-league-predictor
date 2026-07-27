/** Static rules reference so everyone knows how the game works. */

function Rule({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <p className="text-sm leading-relaxed text-white/55">{children}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-white/50">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Rules() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Intro */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-[var(--color-brand)]/25 to-transparent p-5">
          <h1 className="text-xl font-extrabold">Last Man Standing — the rules</h1>
          <p className="mt-1 text-sm text-white/70">
            Pick one team each gameweek. Only a win keeps you alive. Last player standing wins.
          </p>
        </div>
      </div>

      <Section title="The basics">
        <Rule icon="🎯" title="One team per gameweek">
          Each round you pick a single team from that week's fixtures.
        </Rule>
        <Rule icon="✅" title="Only a win is safe">
          If your team wins, you're through. A <strong className="text-white/80">draw or a loss</strong>{' '}
          costs you a life — yes, a draw counts against you.
        </Rule>
        <Rule icon="⏳" title="No pick = a life lost">
          Miss the deadline without a selection and it's treated as a life gone.
        </Rule>
        <Rule icon="❤️" title="Three lives">
          Everyone starts with <strong className="text-white/80">3 lives</strong>. Lose all three and
          you're eliminated.
        </Rule>
        <Rule icon="🔁" title="Never the same team twice">
          Once you've picked a team it's used up for the rest of the season — win, lose or draw. Your
          options shrink every week.
        </Rule>
        <Rule icon="🏆" title="Last one standing wins">
          Outlast everyone else and the pot is yours.
        </Rule>
      </Section>

      <Section title="Good to know">
        <Rule icon="✏️" title="Unlimited changes before the deadline">
          Change your mind as often as you like — you can switch your pick right up until the deadline.
          Only your final choice counts.
        </Rule>
        <Rule icon="⏰" title="Deadline is midday">
          Picks lock at <strong className="text-white/80">12 noon (UK)</strong> on the day of the round's
          first match. If that match is on a weekend, the deadline moves to the{' '}
          <strong className="text-white/80">Friday before at noon</strong> — no weekend scrambling.
        </Rule>
        <Rule icon="🙈" title="Picks are hidden until lock-in">
          Nobody can see your pick before the deadline. The moment it passes, everyone's team is
          revealed and results roll in.
        </Rule>
        <Rule icon="⚔️" title="Double gameweeks — first game counts">
          If your team plays twice in one gameweek, only their <strong className="text-white/80">first
          match</strong> counts. A bad first result can't be rescued by the second.
        </Rule>
        <Rule icon="🔒" title="Your 2-digit PIN">
          Pick your name from the list and enter your PIN to confirm — so no one can pick as you by
          accident.
        </Rule>
        <Rule icon="📊" title="Results are automatic">
          Scores come live from the Premier League. Nobody enters them by hand, and the standings update
          themselves.
        </Rule>
      </Section>

      <Section title="How to make your pick">
        <ol className="space-y-2 text-sm text-white/70">
          {[
            'Open the Make Pick tab.',
            'Choose your name and enter your 2-digit PIN.',
            'Tap a team from your remaining teams (used teams are hidden).',
            'Confirm. Change it any time before the deadline.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-brand)]/20 text-xs font-bold text-[var(--color-brand)]">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
