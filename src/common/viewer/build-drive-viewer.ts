import { DriveViewerDto } from '../../laudos/dto/drive-viewer.dto';

/**
 * Forma normalizada de `currentUser` que o `OptionalJwtAuthGuard`
 * deixa disponível em `req.user` quando o token JWT é válido.
 * Também pode vir `undefined` (chamador anônimo) — nesse caso o
 * helper devolve um viewer com tudo `false`.
 */
export type DriveViewerSubject = {
  id: string;
  role?: string;
} | undefined;

/**
 * Helper compartilhado por `LaudosService.getAmbientesWeb` e
 * `UploadsService.getImagensByAmbiente` para calcular o `viewer`
 * (permissões do chamador sobre um laudo específico).
 *
 * Regra binária:
 * - dono do laudo OU papel `DEV`/`ADMIN` → todos os `can*` = `true`
 * - qualquer outro (anônimo ou logado não-dono) → todos os `can*`
 *   = `false` (modo visualização)
 *
 * O resultado é embutido na resposta da rota para o frontend poder
 * esconder/desabilitar botões de ação sem assumir nada sobre o
 * chamador. A trava **real** de escrita continua sendo o `JwtAuthGuard`
 * + checagem de ownership/admin no service das rotas de mutação.
 */
export function buildDriveViewer(
  currentUser: DriveViewerSubject,
  laudo: { usuarioId: string },
): DriveViewerDto {
  const isOwner = !!currentUser && currentUser.id === laudo.usuarioId;
  const isAdmin = !!currentUser && (currentUser.role === 'DEV' || currentUser.role === 'ADMIN');
  const canWrite = isOwner || isAdmin;

  return {
    isOwner,
    isAdmin,
    canWrite,
    canDelete: canWrite,
    canDownloadFoto: canWrite,
    canRequestAmbienteZip: canWrite,
    canRequestLaudoZip: canWrite,
  };
}
