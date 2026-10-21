'use client';

import { useMemo, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { saveReview } from './actions';
import {
  RECON_LABEL,
  REVIEW_BY_VALUE,
  REVIEW_OPTIONS,
  type ReviewStatus,
} from './review-config';

export type Evidence = {
  exact_excerpt: string;
  source_locator: string | null;
  evidence_role: string;
  filename: string;
};
export type Match = {
  external_reference: string | null;
  title: string | null;
  matching_method: string;
  match_score: number;
  explanation: string;
};
export type Finding = {
  id: string;
  normalized_title: string;
  description: string | null;
  event_date: string | null;
  detected_parties: string[];
  potential_change_type: string | null;
  extraction_confidence: number;
  reconciliation_status: string;
  review_status: ReviewStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  evidence: Evidence[];
  matches: Match[];
};

export function ReviewWorkspace({
  projectId,
  findings: initial,
}: {
  projectId: string;
  findings: Finding[];
}) {
  const [findings, setFindings] = useState<Finding[]>(initial);
  const [selectedId, setSelectedId] = useState<string>(initial[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return findings.filter((f) => {
      if (statusFilter !== 'all' && f.review_status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.normalized_title.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q) ||
        f.evidence.some((e) => e.exact_excerpt.toLowerCase().includes(q))
      );
    });
  }, [findings, search, statusFilter]);

  const selected = findings.find((f) => f.id === selectedId) ?? filtered[0] ?? null;

  function onSaved(updated: Finding) {
    setFindings((list) => list.map((f) => (f.id === updated.id ? updated : f)));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr_19rem]">
      {/* LEFT: filters + list */}
      <aside className="rounded-lg border border-line bg-white">
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-ink/60" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings"
              className="w-full rounded-md border border-line py-1.5 pl-8 pr-2 text-sm outline-none focus:border-signal"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ReviewStatus)}
            className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            {REVIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <ul className="max-h-[32rem] overflow-auto">
          {filtered.length === 0 && (
            <li className="p-4 text-sm text-ink">No findings match.</li>
          )}
          {filtered.map((f) => {
            const opt = REVIEW_BY_VALUE[f.review_status];
            const Icon = opt.icon;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-line px-3 py-2.5 text-left hover:bg-surface ${
                    selected?.id === f.id ? 'bg-surface' : ''
                  }`}
                >
                  <span className="text-sm font-medium text-navy">{f.normalized_title}</span>
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className={`rounded-full px-1.5 py-0.5 ${opt.badge}`}>{opt.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* CENTER: evidence */}
      <section className="rounded-lg border border-line bg-white p-5">
        {selected ? (
          <CandidateDetail finding={selected} />
        ) : (
          <p className="text-ink">Select a finding.</p>
        )}
      </section>

      {/* RIGHT: decision */}
      <aside className="rounded-lg border border-line bg-white p-4">
        {selected ? (
          <DecisionPanel key={selected.id} projectId={projectId} finding={selected} onSaved={onSaved} />
        ) : null}
      </aside>
    </div>
  );
}

function CandidateDetail({ finding: f }: { finding: Finding }) {
  const recon = RECON_LABEL[f.reconciliation_status] ?? RECON_LABEL.insufficient_data;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-navy">{f.normalized_title}</h2>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${recon.className}`}>
          {recon.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink">
        {f.potential_change_type?.replace(/_/g, ' ')}
        {f.event_date ? ` · ${f.event_date}` : ''}
        {f.detected_parties.length ? ` · ${f.detected_parties.join(', ')}` : ''}
        {` · confidence ${(f.extraction_confidence * 100).toFixed(0)}%`}
      </p>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-ink">Observed evidence</h3>
      <ul className="mt-2 space-y-3">
        {f.evidence.map((e, i) => (
          <li key={i} className="border-l-2 border-signal/40 pl-3">
            <p className="text-sm text-ink">“{e.exact_excerpt}”</p>
            <p className="mt-0.5 text-xs text-ink/70">
              {e.filename}
              {e.source_locator ? ` · ${e.source_locator}` : ''}
              {e.evidence_role === 'primary' ? ' · primary' : ''}
            </p>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-ink">Register comparison</h3>
      {f.matches.length === 0 ? (
        <p className="mt-2 text-sm text-ink">
          No corresponding entry identified in the supplied register. This does not establish that
          the event was undocumented elsewhere.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {f.matches.map((m, i) => (
            <li key={i} className="text-sm text-ink">
              <span className="font-medium text-navy">{m.external_reference ?? '—'}</span>
              {m.title ? ` · ${m.title}` : ''} — {m.explanation}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-ink">Uncertainty</h3>
      <p className="mt-1 text-sm text-ink">
        Original subcontract scope and other tracking systems have not been verified. ScopeSignal
        does not determine contractual entitlement or recoverable amounts.
      </p>
    </div>
  );
}

function DecisionPanel({
  projectId,
  finding,
  onSaved,
}: {
  projectId: string;
  finding: Finding;
  onSaved: (f: Finding) => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>(finding.review_status);
  const [notes, setNotes] = useState(finding.review_notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      const res = await saveReview({
        projectId,
        candidateId: finding.id,
        reviewStatus: status,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved({
        ...finding,
        review_status: status,
        review_notes: notes || null,
        reviewed_at: res.reviewedAt,
      });
      setSavedMsg(`Saved · ${res.reviewerEmail}`);
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy">Review decision</h3>
      {finding.reviewed_at && (
        <p className="mt-1 text-xs text-ink">
          Last reviewed {new Date(finding.reviewed_at).toLocaleString()}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {REVIEW_OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                status === o.value ? 'border-signal bg-signal/5' : 'border-line hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="review"
                className="mt-1"
                checked={status === o.value}
                onChange={() => setStatus(o.value)}
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-navy">
                  <Icon className="h-4 w-4" aria-hidden />
                  {o.label}
                </span>
                <span className="text-xs text-ink">{o.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <label className="mt-3 block text-sm font-medium text-navy">
        Reviewer notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Optional context for this decision…"
          className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-signal"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 w-full rounded-md bg-signal px-3 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save decision'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {savedMsg && <p className="mt-2 text-sm text-emerald-700">{savedMsg}</p>}
    </div>
  );
}
