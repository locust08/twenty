import { useLingui } from '@lingui/react/macro';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SunyieldWhatsappPanel } from '@/sunyield/components/SunyieldWhatsappPanel';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
export const SettingsSunyieldWhatsapp = () => {
  const { t } = useLingui();
  return (
    <SettingsPageLayout
      title={t`WhatsApp notifications`}
      links={[
        { children: t`Workspace`, href: getSettingsPath(SettingsPath.General) },
        { children: t`WhatsApp notifications` },
      ]}
    >
      <SunyieldWhatsappPanel />
    </SettingsPageLayout>
  );
};
