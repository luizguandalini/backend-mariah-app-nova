import { UserRole } from './enums/user-role.enum';
import {
  allowedRoleTransitions,
  canChangeRole,
} from './role-policy';

describe('canChangeRole — role-edit authorization matrix', () => {
  describe('DEV actor', () => {
    it('allows DEV to promote USUARIO -> ADMIN', () => {
      expect(canChangeRole(UserRole.DEV, UserRole.USUARIO, UserRole.ADMIN)).toBe(true);
    });

    it('allows DEV to demote ADMIN -> USUARIO', () => {
      expect(canChangeRole(UserRole.DEV, UserRole.ADMIN, UserRole.USUARIO)).toBe(true);
    });

    it('forbids DEV to promote anyone to DEV', () => {
      expect(canChangeRole(UserRole.DEV, UserRole.USUARIO, UserRole.DEV)).toBe(false);
      expect(canChangeRole(UserRole.DEV, UserRole.ADMIN, UserRole.DEV)).toBe(false);
    });

    it('forbids DEV to touch another DEV user', () => {
      expect(canChangeRole(UserRole.DEV, UserRole.DEV, UserRole.USUARIO)).toBe(false);
      expect(canChangeRole(UserRole.DEV, UserRole.DEV, UserRole.ADMIN)).toBe(false);
    });
  });

  describe('ADMIN actor', () => {
    it('allows ADMIN to promote USUARIO -> ADMIN', () => {
      expect(canChangeRole(UserRole.ADMIN, UserRole.USUARIO, UserRole.ADMIN)).toBe(true);
    });

    it('allows ADMIN to demote ADMIN -> USUARIO', () => {
      expect(canChangeRole(UserRole.ADMIN, UserRole.ADMIN, UserRole.USUARIO)).toBe(true);
    });

    it('forbids ADMIN to touch a DEV user (no powers over DEV)', () => {
      expect(canChangeRole(UserRole.ADMIN, UserRole.DEV, UserRole.USUARIO)).toBe(false);
      expect(canChangeRole(UserRole.ADMIN, UserRole.DEV, UserRole.ADMIN)).toBe(false);
    });

    it('forbids ADMIN to promote anyone to DEV', () => {
      expect(canChangeRole(UserRole.ADMIN, UserRole.USUARIO, UserRole.DEV)).toBe(false);
      expect(canChangeRole(UserRole.ADMIN, UserRole.ADMIN, UserRole.DEV)).toBe(false);
    });
  });

  describe('Common actors (USUARIO, FUNCIONARIO, others)', () => {
    it('forbids USUARIO from any role edit', () => {
      expect(canChangeRole(UserRole.USUARIO, UserRole.USUARIO, UserRole.ADMIN)).toBe(false);
      expect(canChangeRole(UserRole.USUARIO, UserRole.ADMIN, UserRole.USUARIO)).toBe(false);
    });

    it('forbids FUNCIONARIO from any role edit', () => {
      expect(canChangeRole(UserRole.FUNCIONARIO, UserRole.USUARIO, UserRole.ADMIN)).toBe(false);
    });
  });
});

describe('allowedRoleTransitions', () => {
  it('returns ADMIN for ADMIN actor targeting USUARIO', () => {
    expect(allowedRoleTransitions(UserRole.ADMIN, UserRole.USUARIO)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('returns USUARIO for ADMIN actor targeting ADMIN', () => {
    expect(allowedRoleTransitions(UserRole.ADMIN, UserRole.ADMIN)).toEqual([
      UserRole.USUARIO,
    ]);
  });

  it('returns both directions for DEV actor on USUARIO', () => {
    // DEV can promote USUARIO to ADMIN; the USUARIO->USUARIO no-op is filtered
    // out by the candidate list (only USUARIO and ADMIN candidates).
    expect(allowedRoleTransitions(UserRole.DEV, UserRole.USUARIO)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('returns both directions for DEV actor on ADMIN', () => {
    expect(allowedRoleTransitions(UserRole.DEV, UserRole.ADMIN)).toEqual([
      UserRole.USUARIO,
    ]);
  });

  it('returns an empty list for ADMIN actor on DEV target', () => {
    expect(allowedRoleTransitions(UserRole.ADMIN, UserRole.DEV)).toEqual([]);
  });

  it('returns an empty list for common actor on USUARIO', () => {
    expect(allowedRoleTransitions(UserRole.USUARIO, UserRole.USUARIO)).toEqual([]);
  });
});
