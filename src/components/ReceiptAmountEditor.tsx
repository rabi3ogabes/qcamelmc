import { useEffect, useState } from 'react';
import { Check, Pencil, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ReceiptAmountEditor({ amount, onSave }: { amount: number | null; onSave: (value: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(amount?.toFixed(2) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!editing) setDraft(amount?.toFixed(2) ?? ''); }, [amount, editing]);
  const save = async () => {
    const value = Number(draft);
    if (!draft.trim() || !Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
      setError('Enter a valid amount with up to 2 decimals.');
      return;
    }
    setSaving(true);
    setError(null);
    try { await onSave(value); setEditing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Amount could not be saved.'); }
    finally { setSaving(false); }
  };
  if (!editing) return <div className="flex items-center gap-1 font-mono font-semibold">
    <span>{amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</span>
    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Edit Amount (QAR)" title="Edit Amount (QAR)" onClick={() => { setError(null); setEditing(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
  </div>;
  return <div className="space-y-1">
    <div className="flex items-center gap-1">
      <Input autoFocus type="number" min="0" step="0.01" aria-label="Amount (QAR)" value={draft} disabled={saving} onChange={e => setDraft(e.target.value)} className="h-8 w-24 font-mono" onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape' && !saving) setEditing(false); }} />
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Save amount" title="Save amount" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Cancel amount edit" title="Cancel" disabled={saving} onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive max-w-48">{error}</p>}
  </div>;
}