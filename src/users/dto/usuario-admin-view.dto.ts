import { ApiProperty } from '@nestjs/swagger';

/**
 * Per-row flags attached to every entry in the user-listing and
 * user-detail responses, computed by the backend against the actor.
 *
 * The frontend uses `isSelf` to hide the access-level toggle on the
 * logged-in user's own row (since the backend already rejects self
 * role-changes) and uses `canDelete` to show or hide the delete action
 * per row.
 */
export class UsuarioAccessFlags {
  @ApiProperty({
    description:
      'True se a linha representa o próprio usuário autenticado. ' +
      'Use para esconder o toggle de nível de acesso na própria linha.',
  })
  isSelf: boolean;

  @ApiProperty({
    description:
      'True se o usuário autenticado tem permissão para deletar esta linha ' +
      '(ADMIN/DEV pode deletar ADMIN/USER comuns, nunca DEV, nunca a si mesmo). ' +
      'Use para exibir ou esconder o botão de deletar.',
  })
  canDelete: boolean;
}
