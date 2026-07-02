import { UserRole } from './enums/user-role.enum';

/**
 * Authorization matrix for role changes.
 *
 * Allowed (targetCurrentRole, newRole) pairs, regardless of actor:
 *   (USUARIO, ADMIN) — promote
 *   (ADMIN,   USUARIO) — demote
 *
 * Anything else is rejected by this policy, including:
 *   - (USUARIO, USUARIO), (ADMIN, ADMIN)  — left to the service layer as no-ops
 *   - (anything, DEV)                     — DEV is seeded by ops only
 *   - (DEV, anything)                     — DEV is immutable from the API
 *
 * The actor's own role only restricts whether they are allowed to perform
 * the transition. Both ADMIN and DEV can run the two allowed pairs; common
 * actors (USUARIO, FUNCIONARIO, etc.) cannot.
 */
type Pair = readonly [UserRole, UserRole];

const ALLOWED_PAIRS: ReadonlySet<string> = new Set<string>(
  (
    [
      [UserRole.USUARIO, UserRole.ADMIN],
      [UserRole.ADMIN, UserRole.USUARIO],
    ] as Pair[]
  ).map((p: Pair) => `${p[0]}->${p[1]}`),
);

const ADMIN_OR_DEV: ReadonlySet<UserRole> = new Set<UserRole>([
  UserRole.DEV,
  UserRole.ADMIN,
]);

function pairKey(from: UserRole, to: UserRole): string {
  return `${from}->${to}`;
}

/**
 * Pure predicate: returns true when `actorRole` is allowed to change
 * `targetCurrentRole` to `newRole`.
 *
 * Self-edit and same-role transitions are NOT handled here — the service
 * layer rejects those before reaching this predicate. Keeping this function
 * pure makes it safe to unit-test exhaustively.
 */
export function canChangeRole(
  actorRole: UserRole,
  targetCurrentRole: UserRole,
  newRole: UserRole,
): boolean {
  if (!ADMIN_OR_DEV.has(actorRole)) {
    return false;
  }
  return ALLOWED_PAIRS.has(pairKey(targetCurrentRole, newRole));
}

/**
 * Returns the list of `newRole` candidates the actor may set for a target
 * currently holding `targetCurrentRole`. Used by the frontend to render
 * only the allowed options in the role select.
 */
export function allowedRoleTransitions(
  actorRole: UserRole,
  targetCurrentRole: UserRole,
): UserRole[] {
  const candidates: UserRole[] = [UserRole.USUARIO, UserRole.ADMIN];
  return candidates.filter((candidate) =>
    canChangeRole(actorRole, targetCurrentRole, candidate),
  );
}
