import { useCallback, useEffect, useRef, useState } from 'react';
import { pragueDate, type GameStopConfiguration } from '@jetlag/geo-core';
import type { PidCommand, PidComparison, PidView } from './pid-types';
const publicationBase = () => new URL(import.meta.env.BASE_URL, document.baseURI).href;

export function usePid(configuration: GameStopConfiguration) {
  const [view, setView] = useState<PidView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [warning, setWarning] = useState('');
  const [referenceDate, setReferenceDate] = useState(pragueDate);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const waiting = useRef(new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>());
  const currentConfiguration = useRef(configuration); currentConfiguration.current = configuration;
  const acceptView = useCallback((next: PidView) => setView(previous => previous && previous.summary.id === next.summary.id && previous.configurationKey === next.configurationKey && previous.referenceDate === next.referenceDate ? previous : next), []);
  useEffect(() => { const timer = setInterval(() => setReferenceDate(pragueDate()), 60000); return () => clearInterval(timer); }, []);
  const request = useCallback(<T,>(command: PidCommand): Promise<T> => new Promise((resolve, reject) => {
    if (!worker.current) { reject(new Error('Worker PID není dostupný.')); return; }
    const requestId = ++nextId.current;
    waiting.current.set(requestId, { resolve: value => resolve(value as T), reject });
    worker.current.postMessage({ ...command, requestId }, command.action === 'compare' ? [command.data] : []);
  }), []);
  useEffect(() => {
    let cancelled = false;
    const instance = new Worker(new URL('./pid.worker.ts', import.meta.url), { type: 'module' }); worker.current = instance;
    const promises = waiting.current;
    instance.onmessage = event => {
      const result = event.data as { requestId: number; value: unknown; error?: string };
      const promise = promises.get(result.requestId); if (!promise) return;
      promises.delete(result.requestId); if (result.error) promise.reject(new Error(result.error)); else promise.resolve(result.value);
    };
    instance.onerror = () => { for (const promise of promises.values()) promise.reject(new Error('Zpracování PID ve workeru selhalo.')); promises.clear(); };
    request<PidView & { warning: string; attempt: { error: string | null } | null }>({ action: 'hydrate', base: publicationBase(), configuration: currentConfiguration.current }).then(value => {
      if (cancelled) return; acceptView(value); setReady(true); setLoadError(''); setWarning(value.warning); setUpdateError(value.attempt?.error || '');
      setBusy(true);
      return request<PidView & { error?: string | null; warning?: string }>({ action: 'refresh', base: publicationBase(), configuration: currentConfiguration.current, force: false }).then(result => {
        if (!cancelled) { acceptView(result); setUpdateError(result.error ?? ''); if (result.warning) setWarning(result.warning); }
      }).catch(error => { if (!cancelled) setUpdateError(error instanceof Error ? error.message : 'Aktualizace PID selhala.'); }).finally(() => { if (!cancelled) setBusy(false); });
    }).catch(error => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : 'PID nelze načíst.'); setReady(true); } });
    return () => { cancelled = true; instance.terminate(); worker.current = null; for (const promise of promises.values()) promise.reject(new Error('Worker byl ukončen.')); promises.clear(); };
  }, [request, acceptView]);
  const key = JSON.stringify(configuration);
  const sourceId = view?.summary.id;
  const viewKey = view?.configurationKey;
  useEffect(() => {
    if (!ready || !sourceId || (viewKey === key && view?.referenceDate === referenceDate)) return;
    let cancelled = false;
    request<PidView>({ action: 'derive', configuration: currentConfiguration.current }).then(value => { if (!cancelled) acceptView(value); }).catch(error => { if (!cancelled) setWarning(`Přepočet pravidel PID: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [key, viewKey, ready, sourceId, request, referenceDate, view?.referenceDate, acceptView]);
  async function refresh() {
    if (busy) return; setBusy(true); setUpdateError('');
    let usable = !!view;
    try {
      if (!usable) {
        setLoadError('');
        const restored = await request<PidView & { warning: string }>({ action: 'hydrate', base: publicationBase(), configuration: currentConfiguration.current });
        acceptView(restored); setWarning(restored.warning); usable = true;
      }
      const result = await request<PidView & { warning?: string }>({ action: 'refresh', base: publicationBase(), configuration: currentConfiguration.current, force: true }); acceptView(result); setLoadError(''); setWarning(result.warning ?? '');
    }
    catch (error) { (usable ? setUpdateError : setLoadError)(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function compare(data: ArrayBuffer): Promise<PidComparison> { return request({ action: 'compare', data }); }
  async function apply() { const next = await request<PidView>({ action: 'apply', configuration: currentConfiguration.current }); acceptView(next); setLoadError(''); setUpdateError(''); setWarning(''); }
  return { view, loadError, updateError, warning, busy, ready, request, refresh, compare, apply, deriving: !!view && (view.configurationKey !== key || view.referenceDate !== referenceDate) };
}
