import { v4 } from 'uuid';
import { useSunyieldManagement } from '@/sunyield/hooks/useSunyieldManagement';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { doNotTranslate } from 'twenty-shared/i18n';

export const useCreateSunyieldActivity = (kind: 'note' | 'task') => {
  const management = useSunyieldManagement();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const metadata = objectMetadataItems.find(
    (item) => item.nameSingular === kind,
  );
  const protectedCreate =
    management.isSunyield &&
    !!metadata &&
    !objectPermissionsByObjectMetadataId[metadata.id]?.canUpdateObjectRecords;
  const create = async (
    targets: { id: string; targetObjectNameSingular: string }[],
    content: {
      id?: string;
      title?: string | null;
      bodyV2?: unknown;
      dueAt?: string | null;
    } = {},
  ) => {
    if (targets.length !== 1 || targets[0].targetObjectNameSingular !== 'lead')
      throw new Error(
        doNotTranslate('Choose one assigned lead for this activity'),
      );
    return management.execute(kind, {
      action: 'createActivity',
      kind,
      recordId: content.id ?? v4(),
      leadId: targets[0].id,
      title: content.title ?? '',
      bodyV2: content.bodyV2 ?? null,
      ...(kind === 'task' ? { dueAt: content.dueAt ?? null } : {}),
    });
  };
  return { protectedCreate, create };
};
