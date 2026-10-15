import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameStopConfiguration } from '@jetlag/geo-core';
import type { PidCommand, PidComparison, PidView } from './pid-types';
const publicationBase = () => new URL(import.meta.env.BASE_URL, document.baseURI).href;

export function usePid(configuration: GameStopConfiguration) {
  const [view, setView] = useState<PidView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const waiting = useRef(new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>());
  const currentConfiguration = useRef(configuration); currentConfiguration.current = configuration;
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
      if (cancelled) return; setView(value); setReady(true); setError(value.warning || value.attempt?.error || '');
      setBusy(true);
      return request<PidView & { error?: string | null }>({ action: 'refresh', base: publicationBase(), configuration: currentConfiguration.current, force: false }).then(result => {
        if (!cancelled) { setView(result); setError(result.error ?? value.warning ?? ''); }
      }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'Aktualizace PID selhala.'); }).finally(() => { if (!cancelled) setBusy(false); });
    }).catch(error => { if (!cancelled) { setError(error instanceof Error ? error.message : 'PID nelze načíst.'); setReady(true); } });
    return () => { cancelled = true; instance.terminate(); worker.current = null; for (const promise of promises.values()) promise.reject(new Error('Worker byl ukončen.')); promises.clear(); };
  }, [request]);
  const key = JSON.stringify(configuration);
  const sourceId = view?.summary.id;
  const viewKey = view?.configurationKey;
  useEffect(() => {
    if (!ready || !sourceId || viewKey === key) return;
    let cancelled = false;
    request<PidView>({ action: 'derive', configuration: currentConfiguration.current }).then(value => { if (!cancelled) setView(value); }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [key, viewKey, ready, sourceId, request]);
  async function refresh() {
    if (busy) return; setBusy(true); setError('');
    try { const result = await request<PidView>({ action: 'refresh', base: publicationBase(), configuration: currentConfiguration.current, force: true }); setView(result); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function compare(data: ArrayBuffer): Promise<PidComparison> { return request({ action: 'compare', data }); }
  async function apply() { const next = await request<PidView>({ action: 'apply', configuration: currentConfiguration.current }); setView(next); setError(''); }
  return { view, error, busy, ready, request, refresh, compare, apply, deriving: !!view && view.configurationKey !== key };
}
