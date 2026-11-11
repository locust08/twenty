import { type ReactNode } from 'react';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { TooltipDelay } from '@/ui/layout/tooltip/constants/TooltipDelay';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledTrigger = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  width: 100%;
`;

type SunyieldBoardFieldTooltipProps = {
  objectName: string;
  fieldName: string;
  label: string;
  children: ReactNode;
};

export const SunyieldBoardFieldTooltip = ({
  objectName,
  fieldName,
  label,
  children,
}: SunyieldBoardFieldTooltipProps) => {
  const { enabled } = useSunyieldLayout();
  if (!enabled || objectName !== 'lead') return <>{children}</>;

  return (
    <Tooltip
      content={fieldName === 'rawPhone' ? t`Customer phone` : label}
      delay={TooltipDelay.shortDelay}
      positionMethod="fixed"
    >
      <StyledTrigger>{children}</StyledTrigger>
    </Tooltip>
  );
};
