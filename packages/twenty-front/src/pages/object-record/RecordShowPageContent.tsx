import { type ReactNode } from 'react';
import { SunyieldRecordPageAccessGate } from '@/sunyield/components/SunyieldRecordPageAccessGate';

import { RecordShowPageShell } from '~/pages/object-record/RecordShowPageShell';
import { useRecordShowPage } from '@/object-record/record-show/hooks/useRecordShowPage';
import { useRecordShowPageResource } from '@/object-record/record-show/hooks/useRecordShowPageResource';
import { type RecordShowPageHeaderTitleMode } from '@/object-record/record-show/types/RecordShowPageHeaderTitleMode';

export type RecordShowPageParameters = {
  objectNameSingular?: string;
  objectRecordId?: string;
};

type RecordShowPageContentProps = {
  parameters: RecordShowPageParameters;
  headerActions?: ReactNode;
  headerTitlePrefix?: ReactNode;
  headerTitleAccessory?: ReactNode;
  headerTitleMode?: RecordShowPageHeaderTitleMode;
  isRecordIdentifierBarHidden?: boolean;
};

export const RecordShowPageContent = (props: RecordShowPageContentProps) => (
  <SunyieldRecordPageAccessGate
    objectName={props.parameters.objectNameSingular ?? ''}
    recordId={props.parameters.objectRecordId ?? ''}
  >
    <RecordShowPageContentWithResource
      parameters={props.parameters}
      headerActions={props.headerActions}
      headerTitlePrefix={props.headerTitlePrefix}
      headerTitleAccessory={props.headerTitleAccessory}
      headerTitleMode={props.headerTitleMode}
      isRecordIdentifierBarHidden={props.isRecordIdentifierBarHidden}
    />
  </SunyieldRecordPageAccessGate>
);

type RecordShowPageContentWithResourceProps = RecordShowPageContentProps;

const RecordShowPageContentWithResource = ({
  parameters,
  headerActions,
  headerTitlePrefix,
  headerTitleAccessory,
  headerTitleMode,
  isRecordIdentifierBarHidden,
}: RecordShowPageContentWithResourceProps) => {
  const { objectNameSingular, objectRecordId } = useRecordShowPage(
    parameters.objectNameSingular ?? '',
    parameters.objectRecordId ?? '',
  );

  const { error, loading, record } = useRecordShowPageResource({
    objectNameSingular,
    recordId: objectRecordId,
  });

  return (
    <RecordShowPageShell
      objectNameSingular={objectNameSingular}
      objectRecordId={objectRecordId}
      record={record}
      loading={loading}
      error={error}
      headerActions={headerActions}
      headerTitlePrefix={headerTitlePrefix}
      headerTitleAccessory={headerTitleAccessory}
      headerTitleMode={headerTitleMode}
      isRecordIdentifierBarHidden={isRecordIdentifierBarHidden}
    />
  );
};
