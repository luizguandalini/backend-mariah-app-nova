import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { UsersService } from './users.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { AnalysisQueue } from '../queue/entities/analysis-queue.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { WebLoginTicket } from '../auth/entities/web-login-ticket.entity';
import { UploadsService } from '../uploads/uploads.service';
import { ContestacaoService } from '../contestacao/contestacao.service';
import { UserRole } from './enums/user-role.enum';

const REPO = () => ({
  findOne: jest.fn(),
  save: jest.fn(async (entity) => entity),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: { transaction: jest.fn() },
});

const buildService = async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: UploadsService, useValue: {} },
      { provide: ContestacaoService, useValue: {} },
      { provide: getRepositoryToken(Usuario), useFactory: REPO },
      { provide: getRepositoryToken(ConfiguracaoPdfUsuario), useFactory: REPO },
      { provide: getRepositoryToken(Laudo), useFactory: REPO },
      { provide: getRepositoryToken(ImagemLaudo), useFactory: REPO },
      { provide: getRepositoryToken(AnalysisQueue), useFactory: REPO },
      { provide: getRepositoryToken(RefreshToken), useFactory: REPO },
      { provide: getRepositoryToken(WebLoginTicket), useFactory: REPO },
    ],
  }).compile();

  return moduleRef.get(UsersService);
};

describe('UsersService.changeRole — credit preservation', () => {
  it('3.1 preserves quantidadeImagens=340 when promoting USUARIO -> ADMIN', async () => {
    const service = await buildService();
    const repo = (service as any).usuarioRepository as ReturnType<typeof REPO>;
    const target: Partial<Usuario> = {
      id: 'target-1',
      email: 'u@example.com',
      role: UserRole.USUARIO,
      quantidadeImagens: 340,
    };
    repo.findOne.mockResolvedValue(target);

    const updated = await service.changeRole(
      'target-1',
      { role: UserRole.ADMIN } as ChangeRoleDto,
      { id: 'admin-1', email: 'admin@example.com', role: UserRole.ADMIN },
    );

    expect(updated.role).toBe(UserRole.ADMIN);
    expect(updated.quantidadeImagens).toBe(340);
  });

  it('3.2 preserves quantidadeImagens=340 when demoting ADMIN -> USUARIO', async () => {
    const service = await buildService();
    const repo = (service as any).usuarioRepository as ReturnType<typeof REPO>;
    const target: Partial<Usuario> = {
      id: 'target-1',
      email: 'u@example.com',
      role: UserRole.ADMIN,
      quantidadeImagens: 340,
    };
    repo.findOne.mockResolvedValue(target);

    const updated = await service.changeRole(
      'target-1',
      { role: UserRole.USUARIO } as ChangeRoleDto,
      { id: 'admin-1', email: 'admin@example.com', role: UserRole.ADMIN },
    );

    expect(updated.role).toBe(UserRole.USUARIO);
    expect(updated.quantidadeImagens).toBe(340);
  });

  it('3.3 preserves the counter across a USUARIO -> ADMIN -> USUARIO -> ADMIN toggle', async () => {
    const service = await buildService();
    const repo = (service as any).usuarioRepository as ReturnType<typeof REPO>;

    const initial = { id: 'target-2', email: 't@example.com', role: UserRole.USUARIO, quantidadeImagens: 77 };
    repo.findOne.mockResolvedValue(initial);
    const after1 = await service.changeRole('target-2', { role: UserRole.ADMIN } as ChangeRoleDto, { id: 'a', email: 'a@x', role: UserRole.DEV });
    expect(after1.quantidadeImagens).toBe(77);

    repo.findOne.mockResolvedValue({ ...after1 });
    const after2 = await service.changeRole('target-2', { role: UserRole.USUARIO } as ChangeRoleDto, { id: 'a', email: 'a@x', role: UserRole.DEV });
    expect(after2.quantidadeImagens).toBe(77);

    repo.findOne.mockResolvedValue({ ...after2 });
    const after3 = await service.changeRole('target-2', { role: UserRole.ADMIN } as ChangeRoleDto, { id: 'a', email: 'a@x', role: UserRole.DEV });
    expect(after3.quantidadeImagens).toBe(77);
  });
});

describe('UsersService.changeRole — authorization', () => {
  it('rejects self-edit with BadRequestException', async () => {
    const service = await buildService();
    await expect(
      service.changeRole(
        'self',
        { role: UserRole.ADMIN } as ChangeRoleDto,
        { id: 'self', email: 'me@x', role: UserRole.ADMIN },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects same-role no-op transitions with BadRequestException', async () => {
    const service = await buildService();
    const repo = (service as any).usuarioRepository as ReturnType<typeof REPO>;
    repo.findOne.mockResolvedValue({
      id: 't',
      email: 't@x',
      role: UserRole.USUARIO,
      quantidadeImagens: 0,
    });
    await expect(
      service.changeRole(
        't',
        { role: UserRole.USUARIO } as ChangeRoleDto,
        { id: 'a', email: 'a@x', role: UserRole.ADMIN },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ADMIN actor attempting to change a DEV target with ForbiddenException', async () => {
    const service = await buildService();
    const repo = (service as any).usuarioRepository as ReturnType<typeof REPO>;
    repo.findOne.mockResolvedValue({
      id: 'dev-1',
      email: 'd@x',
      role: UserRole.DEV,
      quantidadeImagens: 0,
    });
    await expect(
      service.changeRole(
        'dev-1',
        { role: UserRole.USUARIO } as ChangeRoleDto,
        { id: 'a', email: 'a@x', role: UserRole.ADMIN },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
