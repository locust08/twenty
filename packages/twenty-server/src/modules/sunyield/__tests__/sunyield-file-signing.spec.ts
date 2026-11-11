import {
  FieldMetadataType,
  FileFolder,
  type ObjectRecord,
} from 'twenty-shared/types';
import { RichTextFieldQueryResultGetterHandler } from 'src/engine/api/common/common-result-getters/handlers/field-handlers/rich-text-field-query-result-getter.handler';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type DataSource } from 'typeorm';
import { FileUrlService } from 'src/engine/core-modules/file/file-url/file-url.service';
import { type JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

describe('Sunyield native file signing', () => {
  it('redacts a re-embedded hidden file without minting a token for sales', async () => {
    const signAsyncOrThrow = jest.fn();
    const service = new FileUrlService(
      { signAsyncOrThrow } as unknown as JwtWrapperService,
      { get: () => 'https://clone.test' } as unknown as TwentyConfigService,
      { query: async () => [] } as unknown as DataSource,
    );
    const context = {
      type: 'user',
      workspace: { id: SUNYIELD_WORKSPACE_ID },
      user: { id: 'sales' },
      userWorkspaceId: 'membership',
      workspaceMemberId: 'member',
    } as WorkspaceAuthContext;
    const result = await withWorkspaceAuthContext(context, () =>
      service.signFileByIdUrl({
        fileId: 'previous-owner-hidden-file',
        workspaceId: SUNYIELD_WORKSPACE_ID,
        fileFolder: FileFolder.FilesField,
      }),
    );
    expect(result).toBe(
      'https://clone.test/file/files-field/previous-owner-hidden-file',
    );
    expect(result).not.toContain('token=');
    const handler = new RichTextFieldQueryResultGetterHandler(service);
    const record = {
      id: 'own-note',
      bodyV2: {
        tiptap: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'https://clone.test/file/files-field/12345678-1234-4234-8234-123456789012',
              },
            },
          ],
        }),
      },
    } as ObjectRecord;
    const read = await withWorkspaceAuthContext(context, () =>
      handler.handle(record, SUNYIELD_WORKSPACE_ID, [
        { name: 'bodyV2', type: FieldMetadataType.RICH_TEXT },
      ] as FlatFieldMetadata[]),
    );
    expect(JSON.parse(read.bodyV2.tiptap).content[0].attrs.src).toBe(
      'https://clone.test/file/files-field/12345678-1234-4234-8234-123456789012',
    );
    expect(signAsyncOrThrow).not.toHaveBeenCalled();
  });
});
