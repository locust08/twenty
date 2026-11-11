import { type SunyieldFileIdentity } from 'src/modules/sunyield/permissions/sunyield-file-access';
import { type CommonPropertiesJwtPayload } from 'src/engine/core-modules/auth/types/common-properties-jwt-payload.type';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';

export type FileTokenJwtPayload = CommonPropertiesJwtPayload & {
  type: JwtTokenTypeEnum.FILE;
  workspaceId: string;
  fileId: string;
  sunyieldFileIdentity?: SunyieldFileIdentity;
};
