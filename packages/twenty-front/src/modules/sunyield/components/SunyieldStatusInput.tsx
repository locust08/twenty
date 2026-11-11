import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { z } from 'zod';
import { useToast } from 'twenty-ui/components/feedback';
import { type SelectOption } from 'twenty-ui/primitives/input';
import { FieldInputDropdown } from '@/object-record/record-field/ui/meta-types/input/components/FieldInputDropdown';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { SelectInput } from '@/ui/input/components/SelectInput';
import {
  saveSunyieldStatus,
  SUNYIELD_LEAD_SNAPSHOT_SCHEMA,
  type SunyieldLeadSnapshot,
} from '@/sunyield/utils/saveSunyieldStatus';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
const PENDING_RECORDS = new Set<string>();
type SunyieldStatusInputProps = {
  snapshot: SunyieldLeadSnapshot | undefined;
  options: SelectOption[];
  onClose: () => void;
};
export const SunyieldStatusInput = ({
  snapshot,
  options,
  onClose,
}: SunyieldStatusInputProps) => {
  const [openedSnapshot] = useState(snapshot);
  const [saving, setSaving] = useState(false);
  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const { enqueueToast } = useToast();
  const { t } = useLingui();
  const handleSubmit = async (option: SelectOption) => {
    if (!openedSnapshot || PENDING_RECORDS.has(openedSnapshot.id)) return;
    if (option.value === openedSnapshot.status) {
      onClose();
      return;
    }
    PENDING_RECORDS.add(openedSnapshot.id);
    setSaving(true);
    try {
      const lead = await saveSunyieldStatus({
        baseUrl: REACT_APP_SERVER_BASE_URL,
        recordId: openedSnapshot.id,
        status: String(option.value),
        expectedUpdatedAt: openedSnapshot.updatedAt,
        request: fetch,
      });
      upsertRecordsInStore({
        partialRecords: [{ ...lead, __typename: 'Lead' }],
      });
      enqueueToast({ status: 'success', children: t`Status updated` });
    } catch {
      try {
        const response = await fetch(
          REACT_APP_SERVER_BASE_URL +
            '/rest/leads/' +
            encodeURIComponent(openedSnapshot.id) +
            '?depth=0',
          { credentials: 'include' },
        );
        if (response.ok) {
          const parsed = z
            .object({ data: z.object({ lead: SUNYIELD_LEAD_SNAPSHOT_SCHEMA }) })
            .safeParse(await response.json());
          if (parsed.success)
            upsertRecordsInStore({
              partialRecords: [
                { ...parsed.data.data.lead, __typename: 'Lead' },
              ],
            });
        }
      } catch {
        // A failed refresh must never retry the write.
      }
      enqueueToast({
        status: 'error',
        children: t`The status could not be confirmed. The lead may have changed or been reassigned. Check the lead before trying again.`,
      });
    } finally {
      PENDING_RECORDS.delete(openedSnapshot.id);
      setSaving(false);
      onClose();
    }
  };
  return (
    <FieldInputDropdown
      value={openedSnapshot?.status ?? null}
      shouldSkipPersist
      onDismiss={onClose}
    >
      <div aria-busy={saving}>
        <SelectInput
          options={options}
          value={openedSnapshot?.status ?? null}
          onOptionSelected={handleSubmit}
        />
      </div>
    </FieldInputDropdown>
  );
};
