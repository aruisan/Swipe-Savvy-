'use client';

import { useEffect, useState } from 'react';
import { ledgerApi } from '@/lib/api';
import { HealthStatus } from '@/types/ledger';

export function DeploymentBadge() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchHealth = async () => {
      try {
        const data = await ledgerApi.getHealth();
        if (active) {
          setHealth(data);
          setOffline(false);
        }
      } catch {
        if (active) {
          setOffline(true);
        }
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (offline || !health) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        API OFFLINE
      </div>
    );
  }

  const isGreen = health.environment === 'green';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide uppercase transition-colors ${
        isGreen
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-sky-300 bg-sky-50 text-sky-800'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isGreen ? 'bg-emerald-500' : 'bg-sky-500'
        } animate-pulse`}
      />
      Active Node: {health.environment}
    </div>
  );
}