import { UserRole } from './enums/user-role.enum';

/**
 * Authorization policy for the user-deletion capability.
 *
 * The full delete matrix (see openspec/specs/user-deletion/spec.md) is:
 *
 * | Actor \ Target | common | ADMIN | DEV | self (any role) |
 * |----------------|:------:|:-----:|:---:|:---------------:|
 * | common         | forbidden | forbidden | forbidden | forbidden |
 * | ADMIN          | allowed   | allowed   | forbidden | forbidden |
 * | DEV            | allowed   | allowed   | forbidden | forbidden |
 *
 * "Self" here is `actor.id === target.id`, regardless of role — every
 * actor is forbidden from deleting themselves, including DEV.
 *
 * The two helper functions below are kept pure (no DB / no logger) so
 * they are safe to call from the service layer and from anywhere a flag
 * needs to be computed.
 */

/** Minimum shape we need to evaluate the matrix. */
export interface DeleteTargetShape {
  id: string;
  role: UserRole;
  deletedAt: Date | null;
}

export interface DeleteActorShape {
  id: string;
  role: UserRole;
}

export interface AccessFlags {
  isSelf: boolean;
  canDelete: boolean;
}

/**
 * True if `actor` is allowed to soft-delete `target`. Does NOT consult
 * the database — the caller is responsible for verifying the target row
 * exists and is not already soft-deleted. This function only encodes the
 * role matrix.
 */
export function canDeleteUser(
  actor: DeleteActorShape,
  target: DeleteTargetShape,
): boolean {
  if (actor.id === target.id) {
    return false; // self
  }
  if (target.role === UserRole.DEV) {
    return false; // DEV is protected
  }
  return actor.role === UserRole.ADMIN || actor.role === UserRole.DEV;
}

/**
 * Computes the per-row flags that the user-listing and user-detail
 * responses expose to the frontend. The frontend hides the access-level
 * toggle on rows where `isSelf === true` and the delete action on rows
 * where `canDelete === false`.
 *
 * `canDelete` is `false` when:
 *   - the target is the actor (self), or
 *   - the target has role DEV, or
 *   - the target is already soft-deleted, or
 *   - the actor is not ADMIN/DEV.
 *
 * The actor is always ADMIN/DEV at this point because the endpoint has a
 * @Roles(UserRole.DEV, UserRole.ADMIN) guard, but the helper is defensive
 * in case it's reused from a non-guarded path.
 */
export function computeAccessFlags(
  target: DeleteTargetShape,
  actor: DeleteActorShape,
): AccessFlags {
  const isSelf = target.id === actor.id;
  const canDelete = canDeleteUser(actor, target) && target.deletedAt === null;
  return { isSelf, canDelete };
}
