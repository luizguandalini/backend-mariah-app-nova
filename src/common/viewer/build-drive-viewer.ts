import { DriveViewerDto } from '../../laudos/dto/drive-viewer.dto';

/**
 * Forma normalizada de `currentUser` que o `OptionalJwtAuthGuard`
 * deixa disponível em `req.user` quando o token JWT é válido.
 * Também pode vir `undefined` (chamador anônimo) — nesse caso o
 * helper devolve um viewer com `isOwner/isAdmin/canWrite/canDelete`
 * = `false`, mas os três `canDownload*` continuam `true` (liberalizado
 * pela change `enable-download-in-visualization`).
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
 * Regra mista:
 * - `canWrite`, `canDelete` = `isOwner || isAdmin` (binário: só
 *   dono OU admin/dev pode mutar).
 * - `canDownloadFoto`, `canRequestAmbienteZip`, `canRequestLaudoZip`
 *   = `true` em **todos** os casos (liberalizado pela change
 *   `enable-download-in-visualization`): qualquer chamador que
 *   conseguiu ler a drive view pode baixar. A trava server-side
 *   dos endpoints de download (defesa em profundidade + rate limit
 *   + audit log) garante que isso não vira superfície de abuso.
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
    // Liberalizado: anônimo, logado não-dono, dono, admin/dev — todos
    // podem baixar via endpoints de download (ver design.md da change
    // `enable-download-in-visualization`).
    canDownloadFoto: true,
    canRequestAmbienteZip: true,
    canRequestLaudoZip: true,
  };
}
