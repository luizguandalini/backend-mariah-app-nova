import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { UploadsService } from './uploads.service';
import { CheckLimitDto } from './dto';
import { Usuario } from '../users/entities/usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from './entities/imagem-laudo.entity';
import { ItemAmbiente } from '../ambientes/entities/item-ambiente.entity';
import { Ambiente } from '../ambientes/entities/ambiente.entity';
import { OpenAIService } from '../openai/openai.service';
import { SystemConfigService } from '../config/config.service';
import { UserRole } from '../users/enums/user-role.enum';

const buildServiceWithUser = async (usuario: Partial<Usuario>) => {
  const usuarioRepo = { findOne: jest.fn().mockResolvedValue(usuario) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      UploadsService,
      { provide: getRepositoryToken(Usuario), useValue: usuarioRepo },
      { provide: getRepositoryToken(Laudo), useValue: { findOne: jest.fn() } },
      { provide: getRepositoryToken(ImagemLaudo), useValue: {} },
      { provide: getRepositoryToken(ItemAmbiente), useValue: {} },
      { provide: getRepositoryToken(Ambiente), useValue: {} },
      { provide: OpenAIService, useValue: {} },
      { provide: SystemConfigService, useValue: { getMaxImagensPorLaudo: () => 30 } },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, fallback?: any) => {
            if (key === 'S3_BUCKET_NAME') return 'test-bucket';
            return fallback;
          }),
        },
      },
    ],
  }).compile();

  return { service: moduleRef.get(UploadsService), usuarioRepo };
};

describe('UploadsService.checkUploadLimit — role-toggle behaviour', () => {
  it('4.1 ADMIN with stored counter 0 can still upload (returns canUpload=true, available=999999)', async () => {
    const { service } = await buildServiceWithUser({
      id: 'u',
      role: UserRole.ADMIN,
      quantidadeImagens: 0,
    });
    const result = await service.checkUploadLimit('u', { totalFotos: 50 } as CheckLimitDto);
    expect(result.canUpload).toBe(true);
    expect(result.available).toBe(999999);
  });

  it('4.2 demoted user (USUARIO) with counter 0 cannot upload', async () => {
    const { service } = await buildServiceWithUser({
      id: 'u',
      role: UserRole.USUARIO,
      quantidadeImagens: 0,
    });
    const result = await service.checkUploadLimit('u', { totalFotos: 50 } as CheckLimitDto);
    expect(result.canUpload).toBe(false);
    expect(result.available).toBe(0);
  });

  it('a demoted user with counter 340 can still upload 50 images', async () => {
    const { service } = await buildServiceWithUser({
      id: 'u',
      role: UserRole.USUARIO,
      quantidadeImagens: 340,
    });
    const result = await service.checkUploadLimit('u', { totalFotos: 50 } as CheckLimitDto);
    expect(result.canUpload).toBe(true);
    expect(result.available).toBe(340);
  });

  it('a demoted user with counter 30 cannot upload 50 images (preserved-counter enforcement)', async () => {
    const { service } = await buildServiceWithUser({
      id: 'u',
      role: UserRole.USUARIO,
      quantidadeImagens: 30,
    });
    const result = await service.checkUploadLimit('u', { totalFotos: 50 } as CheckLimitDto);
    expect(result.canUpload).toBe(false);
    expect(result.available).toBe(30);
    expect(result.required).toBe(50);
  });
});
