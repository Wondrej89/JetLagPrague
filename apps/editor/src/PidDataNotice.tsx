import { isHistoricalPid } from '@jetlag/geo-core';
import type { PidSummary } from './pid-types';

export function PidDataNotice({ summary }: { summary: PidSummary }) {
  if (!isHistoricalPid(summary)) return null;
  return <div className="pid-history-notice" role="note" data-testid="pid-history-notice"><strong>Historická referenční data – neověřeno</strong><span>Datum obsluhy: {summary.serviceDate}. Data lze prohlížet, zobrazovat trasy a počítat úkrytové zóny. Nejsou ověřeným zdrojem pro ostrou hru.</span></div>;
}
