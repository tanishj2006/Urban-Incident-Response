'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

const ITEMS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: '/', label: 'Overview', hint: 'Today at a glance', icon: 'home' },
  { href: '/report', label: 'Report an issue', hint: 'Send a photo, text or voice note', icon: 'report' },
  { href: '/dashboard', label: 'Incidents', hint: 'See and manage every case', icon: 'list' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active =
          item.href === '/'
            ? path === '/'
            : item.href === '/dashboard'
              ? path.startsWith('/dashboard') || path.startsWith('/incidents')
              : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-sm px-3 py-2.5 transition-colors ${
              active ? 'bg-accent text-white shadow-[0_3px_10px_rgba(37,99,235,0.3)]' : 'text-ink-2 hover:bg-accent-soft'
            }`}
          >
            <Icon name={item.icon} size={20} className={active ? 'text-white' : 'text-accent'} />
            <span className="min-w-0">
              <span className="block text-[14.5px] leading-tight font-semibold">{item.label}</span>
              <span className={`block text-[12px] leading-tight ${active ? 'text-white/80' : 'text-muted'}`}>
                {item.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
