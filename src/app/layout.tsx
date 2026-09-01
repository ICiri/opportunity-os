import './tailwind.css';
import './styles.css';
import './palette.css';
import './workspace.css';
import Link from 'next/link';
import {SystemPulse} from '@/components/system-pulse';

export const metadata = {title: 'Opportunity OS', description: 'Evidence-driven opportunity intelligence'};
const Icon = ({name}: {name: string}) => (
  <span className="nav-icon" aria-hidden>
    {name}
  </span>
);

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <Link href="/" className="logo" aria-label="Opportunity OS home">
              <span>O</span>
              <b>
                Opportunity<span>OS</span>
              </b>
            </Link>
            <nav aria-label="Primary">
              <p>Workspace</p>
              <Link href="/">
                <Icon name="HO" />
                Today
              </Link>
              <Link href="/conversations">
                <Icon name="IN" />
                Conversations
              </Link>
              <Link href="/opportunities">
                <Icon name="RE" />
                All jobs
              </Link>
              <Link href="/hunter">
                <Icon name="HU" />
                Daily hunter
              </Link>
              <Link href="/sources">
                <Icon name="SR" />
                Source coverage
              </Link>
              <Link href="/bounties">
                <Icon name="BO" />
                Bounties
              </Link>
              <Link href="/cv-studio">
                <Icon name="CV" />
                CV Studio
              </Link>
              <Link href="/application-batches">
                <Icon name="AP" />
                Application batches
              </Link>
              <Link href="/additional-jobs">
                <Icon name="+J" />
                Additional jobs
              </Link>
              <Link href="/relationships">
                <Icon name="GR" />
                Relationships
              </Link>
              <Link href="/companies/volito-digital/graph">
                <Icon name="CO" />
                Company 360
              </Link>
              <p>Intelligence</p>
              <Link href="/planning">
                <Icon name="EU" />
                Business plan
              </Link>
              <Link href="/analytics">
                <Icon name="AN" />
                Analytics
              </Link>
              <Link href="/design-audit">
                <Icon name="OK" />
                Design audit
              </Link>
              <Link href="/design-lab">
                <Icon name="DL" />
                Design lab
              </Link>
            </nav>
            <SystemPulse />
          </aside>
          <main className="main">{children}</main>
        </div>
        <nav className="mobile-nav" aria-label="Mobile primary">
          <Link href="/">Today</Link>
          <Link href="/conversations">Inbox</Link>
          <Link href="/hunter">Hunter</Link>
          <Link href="/sources">Sources</Link>
          <Link href="/opportunities">Jobs</Link>
          <Link href="/bounties">Bounties</Link>
          <Link href="/cv-studio">CV</Link>
          <Link href="/application-batches">Apply</Link>
          <Link href="/additional-jobs">Extra</Link>
        </nav>
      </body>
    </html>
  );
}
