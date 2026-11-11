import { useLingui } from '@lingui/react/macro';
import { IconAlertTriangle } from 'twenty-ui/icon';
import { useSunyieldStatus } from '@/sunyield/hooks/useSunyieldStatus';

type SunyieldMappingWarningProps = {
  recordId: string;
  fieldMetadataId: string;
};

export const SunyieldMappingWarning = (props: SunyieldMappingWarningProps) => {
  const { hasMappingConflict } = useSunyieldStatus(props);
  const { t } = useLingui();

  if (!hasMappingConflict) return null;

  const message = t`Multiple salespeople are mapped to your account. Ask an admin to correct the Workspace member mapping before updating Status.`;

  return (
    <span role="img" aria-label={message} title={message}>
      <IconAlertTriangle size={14} aria-hidden />
    </span>
  );
};
