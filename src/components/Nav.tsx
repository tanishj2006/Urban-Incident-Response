'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Overview', hint: 'System state' },
  { href: '/report', label: 'Report intake', hint: 'Submit evidence' },
  { href: '/dashboard', label: 'Operations', hint: 'Triage queue' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-sm px-3 py-2 transition-colors ${
              active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-sunken'
            }`}
          >
            <span className="block text-[13.5px] font-medium">{item.label}</span>
            <span className={`block text-[11.5px] ${active ? 'text-accent/70' : 'text-faint'}`}>{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
