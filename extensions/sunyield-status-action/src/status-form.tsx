import { useState, type SyntheticEvent } from 'react';
import { t } from 'twenty-sdk/front-component';
import { type LeadSnapshot } from './update-status';

export type StatusRequest = {
  recordId: string;
  status: string;
  expectedUpdatedAt: string;
};
export type StatusFormProps = {
  recordIds: string[];
  statuses: readonly { label: string; value: string }[];
  load: (recordId: string) => Promise<LeadSnapshot>;
  save: (request: StatusRequest) => Promise<LeadSnapshot>;
};

export const StatusForm = ({
  recordIds,
  statuses,
  load,
  save,
}: StatusFormProps) => {
  const [lead, setLead] = useState<LeadSnapshot | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const recordId = recordIds.length === 1 ? recordIds[0] : null;
  const currentLead = lead?.id === recordId ? lead : null;

  const loadLead = async () => {
    if (!recordId || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setLead(null);
    try {
      const loaded = await load(recordId);
      setLead(loaded);
      setStatus(loaded.status);
    } catch {
      setError(
        t({ message: 'Unable to load this lead. Refresh and try again.' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async () => {
    if (!currentLead || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await save({
        recordId: currentLead.id,
        status,
        expectedUpdatedAt: currentLead.updatedAt,
      });
      setMessage(
        t({
          message: 'Status updated. Refresh the lead view to see the change.',
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t({
              message:
                'Unable to confirm the update. Refresh the lead before trying again.',
            }),
      );
    } finally {
      setLead(null);
      setBusy(false);
    }
  };

  const changeStatus = (event: SyntheticEvent<HTMLSelectElement>) => {
    const value =
      (
        event as SyntheticEvent<HTMLSelectElement> & {
          detail?: { value?: string };
        }
      ).detail?.value ?? event.currentTarget?.value;
    if (statuses.some((option) => option.value === value)) setStatus(value);
  };

  return (
    <section
      style={{
        padding: 24,
        fontFamily: 'var(--t-font-family)',
        color: 'var(--t-font-color-primary)',
      }}
    >
      <h2>{t({ message: 'Update lead status' })}</h2>
      <p>
        {t({
          message:
            'You can view all leads and update the status of leads assigned to you. Contact an admin for reassignment.',
        })}
      </p>
      {!recordId ? (
        <p role="alert">
          {t({ message: 'Select exactly one lead to update its status.' })}
        </p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {!currentLead ? (
            <button type="button" disabled={busy} onClick={loadLead}>
              {busy ? t({ message: 'Loading…' }) : t({ message: 'Load lead' })}
            </button>
          ) : (
            <>
              <label htmlFor="lead-status">{t({ message: 'Status' })}</label>
              <select
                id="lead-status"
                value={status}
                disabled={busy}
                onChange={changeStatus}
              >
                {statuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={
                  busy ||
                  status === currentLead.status ||
                  !statuses.some((option) => option.value === status)
                }
                onClick={saveStatus}
              >
                {busy
                  ? t({ message: 'Saving…' })
                  : t({ message: 'Update status' })}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
};
