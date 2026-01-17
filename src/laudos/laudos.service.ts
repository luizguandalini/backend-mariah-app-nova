import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Laudo, StatusLaudo } from './entities/laudo.entity';
import { CreateLaudoDto } from './dto/create-laudo.dto';
import { UpdateLaudoDto } from './dto/update-laudo.dto';
import { UpdateLaudoDetalhesDto } from './dto/update-laudo-detalhes.dto';
import { UpdateLaudoEnderecoDto } from './dto/update-laudo-endereco.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { ImagensPdfResponseDto, ImagemPdfDto } from './dto/imagens-pdf-response.dto';

import { UploadsService } from '../uploads/uploads.service';
import { RabbitMQService } from '../queue/rabbitmq.service';

@Injectable()
export class LaudosService {
  constructor(
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(LaudoOption)
    private readonly optionRepository: Repository<LaudoOption>,
    @InjectRepository(LaudoSection)
    private readonly sectionRepository: Repository<LaudoSection>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemRepository: Repository<ImagemLaudo>,
    private readonly uploadsService: UploadsService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  // ... (métodos existentes)

  async requestPdfGeneration(laudoId: string, userId: string, userRole: UserRole): Promise<{ message: string, status: string }> {
    const laudo = await this.findOne(laudoId);
    
    // Verificar permissão
    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para gerar o PDF deste laudo');
    }

    // Verificar se já está processando
    if (laudo.pdfStatus === 'PROCESSING') {
        throw new BadRequestException('O PDF já está sendo gerado. Aguarde.');
    }

    // Se já foi gerado e está completed, talvez queiramos regenerar?
    // O usuário clicou em "Baixar Laudo" no front. Se tiver URL, o front baixa direto.
    // Se o front chamou esse endpoint, é porque quer gerar/regenerar.
    
    // Atualizar status para PENDING
    await this.laudoRepository.update(laudoId, {
        pdfStatus: 'PENDING',
        pdfProgress: 0,
        pdfUrl: null // Limpar URL anterior se houver
    });
    
    // Adicionar à fila
    const success = await this.rabbitMQService.addToPdfQueue({
        laudoId,
        usuarioId: userId,
        priority: 5 // Prioridade padrão
    });
    
    if (!success) {
         // Reverter status se falhar ao enfileirar
         await this.laudoRepository.update(laudoId, {
            pdfStatus: 'ERROR',
            pdfProgress: 0
        });
        throw new BadRequestException('Erro ao enfileirar pedido de PDF. Tente novamente.');
    }
    
    return {
        message: 'Solicitação de PDF enviada com sucesso',
        status: 'PENDING'
    };
  }

  // ... (rest of methods)



  async remove(id: string, user: any): Promise<void> {
    const laudo = await this.findOne(id);

    // Verifica se o usuário é o dono do laudo ou é admin/dev
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === 'ADMIN' || user.role === 'DEV';

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException('Você não tem permissão para deletar este laudo');
    }

    await this.laudoRepository.manager.transaction(async (transactionalEntityManager) => {
      // 1. Calcular quantos créditos devolver (imagens não analisadas)
      // Apenas devolve se não for ADMIN/DEV (pois eles têm ilimitado)
      if (![UserRole.DEV, UserRole.ADMIN].includes(user.role)) {
         const refundableImagesCount = await this.imagemRepository.count({
          where: { 
            laudoId: id,
            imagemJaFoiAnalisadaPelaIa: 'nao'
          }
        });

        if (refundableImagesCount > 0) {
          const usuario = await transactionalEntityManager.findOne(Usuario, {
            where: { id: laudo.usuario.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (usuario) {
            usuario.quantidadeImagens += refundableImagesCount;
            await transactionalEntityManager.save(usuario);
          }
        }
      }

      // 2. Deletar PDF do S3 (se existir)
      if (laudo.pdfUrl) {
        try {
          // Extrair s3Key da URL do PDF usando regex
          // Padrão S3 Key: laudos/pdf/{id}_{timestamp}.pdf
          const match = laudo.pdfUrl.match(/(laudos\/pdf\/[^?]+)/);
          if (match && match[1]) {
            const pdfS3Key = match[1];
            await this.uploadsService.deleteFile(pdfS3Key);
          }
        } catch (err) {
          // Não interrompe o fluxo se falhar a deleção do PDF
          console.warn('Falha ao tentar remover PDF do S3:', err);
        }
      }

      // 3. Deletar imagens do S3 (operação async fora do banco)
      // Nota: Idealmente faríamos isso fora da transaction do banco se quiséssemos atomicidade rigorosa do banco vs falha S3,
      // mas aqui queremos garantir que o banco só muda se tudo correr "bem" ou pelo menos iniciarmos o processo.
      // Como o delete do S3 não é transacional com o banco, se falhar o S3, o banco pode rollbackar ou não dependendo de onde colocarmos.
      // O requisito diz "solução robusta". 
      // Se colocarmos o S3 delete ANTES do remove do banco mas DENTRO da transaction function, se o S3 der erro (throw), a transaction do banco nem commita.
      // Porém, o S3 delete pode demorar. Vamos manter a chamada await aqui.
      await this.uploadsService.deleteImagensByLaudo(id);

      // 3. Remover o laudo (CASCADE irá remover as imagens do banco)
      await transactionalEntityManager.remove(laudo);
    });
  }

  async getLaudoDetalhes(id: string) {
    const laudo = await this.laudoRepository.findOne({ where: { id } });
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Buscar todas as seções com suas perguntas e opções
    const sections = await this.sectionRepository.find({
      relations: ['questions', 'questions.options'],
      order: { createdAt: 'ASC' },
    });

    // Retorna os detalhes do laudo + estrutura completa para edição
    return {
      incluirAtestado: laudo.incluirAtestado,
      atestado: laudo.atestado,
      analisesHidraulicas: laudo.analisesHidraulicas,
      analisesEletricas: laudo.analisesEletricas,
      sistemaAr: laudo.sistemaAr,
      mecanismosAbertura: laudo.mecanismosAbertura,
      revestimentos: laudo.revestimentos,
      mobilias: laudo.mobilias,
      dadosExtra: laudo.dadosExtra,
      // Estrutura completa para construir formulário de edição
      availableSections: sections,
    };
  }

  async create(createLaudoDto: CreateLaudoDto): Promise<Laudo> {
    const laudo = this.laudoRepository.create(createLaudoDto);
    return await this.laudoRepository.save(laudo);
  }

  async findAll(): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      relations: ['usuario'],
      order: { createdAt: 'DESC' },
    });
    if (laudos.length === 0) {
      return [];
    }

    const laudosIds = laudos.map((l) => l.id);

    // Consulta agregada eficiente para contar imagens e imagens não analisadas
    // Usando batches para não estourar limite de parametros se houver muitos laudos
    const statsMap = new Map<string, { total: number; unanalyzed: number }>();
    
    // Processar em chunks de 500 ids
    const chunkSize = 500;
    for (let i = 0; i < laudosIds.length; i += chunkSize) {
      const chunk = laudosIds.slice(i, i + chunkSize);
      
      const statsQuery = await this.imagemRepository
        .createQueryBuilder('img')
        .select('img.laudo_id', 'laudoId')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN img.imagem_ja_foi_analisada_pela_ia = 'nao' THEN 1 ELSE 0 END)",
          'unanalyzed',
        )
        .where('img.laudo_id IN (:...ids)', { ids: chunk })
        .groupBy('img.laudo_id')
        .getRawMany();

      statsQuery.forEach((s) => {
        statsMap.set(s.laudoId, {
          total: Number(s.total),
          unanalyzed: Number(s.unanalyzed),
        });
      });
    }

    return laudos.map((l) => {
      let smartStatus = l.status;
      const stats = statsMap.get(l.id) || { total: 0, unanalyzed: 0 };

      // Se tem URL de PDF, consideramos concluído
      if (l.pdfUrl) {
        smartStatus = StatusLaudo.CONCLUIDO;
      }
      // Se não está concluído, mas todas as imagens (pelo menos 1) foram analisadas
      else if (
        smartStatus === StatusLaudo.NAO_INICIADO &&
        stats.total > 0 &&
        stats.unanalyzed === 0
      ) {
        smartStatus = StatusLaudo.CONCLUIDO;
      }

      return {
        id: l.id,
        usuarioId: l.usuarioId,
        endereco: l.endereco,
        rua: l.rua,
        numero: l.numero,
        complemento: l.complemento,
        bairro: l.bairro,
        cidade: l.cidade,
        estado: l.estado,
        cep: l.cep,
        tipoVistoria: l.tipoVistoria,
        tipoUso: l.tipoUso,
        tipoImovel: l.tipoImovel,
        tipo: l.tipo,
        unidade: l.unidade,
        status: smartStatus,
        tamanho: l.tamanho,
        pdfUrl: l.pdfUrl,
        totalAmbientes: l.totalAmbientes,
        totalFotos: l.totalFotos,
        latitude: l.latitude,
        longitude: l.longitude,
        enderecoCompletoGps: l.enderecoCompletoGps,
        incluirAtestado: l.incluirAtestado,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });
  }

   async findByUsuario(usuarioId: string): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
    });

    if (laudos.length === 0) {
      return [];
    }

    const laudosIds = laudos.map((l) => l.id);

    // Consulta agregada eficiente para contar imagens e imagens não analisadas
    const statsQuery = await this.imagemRepository
      .createQueryBuilder('img')
      .select('img.laudo_id', 'laudoId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN img.imagem_ja_foi_analisada_pela_ia = 'nao' THEN 1 ELSE 0 END)",
        'unanalyzed',
      )
      .where('img.laudo_id IN (:...ids)', { ids: laudosIds })
      .groupBy('img.laudo_id')
      .getRawMany();

    const statsMap = new Map<string, { total: number; unanalyzed: number }>();
    statsQuery.forEach((s) => {
      statsMap.set(s.laudoId, {
        total: Number(s.total),
        unanalyzed: Number(s.unanalyzed),
      });
    });

    return laudos.map((l) => {
      let smartStatus = l.status;
      const stats = statsMap.get(l.id) || { total: 0, unanalyzed: 0 };

      // Se tem URL de PDF, consideramos concluído
      if (l.pdfUrl) {
        smartStatus = StatusLaudo.CONCLUIDO;
      }
      // Se não está concluído, mas todas as imagens (pelo menos 1) foram analisadas
      else if (
        smartStatus === StatusLaudo.NAO_INICIADO &&
        stats.total > 0 &&
        stats.unanalyzed === 0
      ) {
        smartStatus = StatusLaudo.CONCLUIDO;
      }

      return {
        id: l.id,
        usuarioId: l.usuarioId,
        endereco: l.endereco,
        rua: l.rua,
        numero: l.numero,
        complemento: l.complemento,
        bairro: l.bairro,
        cidade: l.cidade,
        estado: l.estado,
        cep: l.cep,
        tipoVistoria: l.tipoVistoria,
        tipoUso: l.tipoUso,
        tipoImovel: l.tipoImovel,
        tipo: l.tipo,
        unidade: l.unidade,
        status: smartStatus,
        tamanho: l.tamanho,
        pdfUrl: l.pdfUrl,
        totalAmbientes: l.totalAmbientes,
        totalFotos: l.totalFotos,
        latitude: l.latitude,
        longitude: l.longitude,
        enderecoCompletoGps: l.enderecoCompletoGps,
        incluirAtestado: l.incluirAtestado,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });
  }

  async findOne(id: string): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({
      where: { id },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    return laudo;
  }

  async updateLaudoDetalhes(
    id: string,
    updateDto: UpdateLaudoDetalhesDto,
    user: any,
  ): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({
      where: { id },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verifica permissão (dono ou admin/dev)
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === UserRole.ADMIN || user.role === UserRole.DEV;

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException(
        'Você não tem permissão para editar este laudo',
      );
    }

    // Validar todas as opções fornecidas
    await this.validateLaudoDetalhes(updateDto);

    // Atualizar apenas os campos de detalhes
    if (updateDto.atestado !== undefined) {
      laudo.atestado = updateDto.atestado;
    }
    if (updateDto.analisesHidraulicas !== undefined) {
      laudo.analisesHidraulicas = updateDto.analisesHidraulicas as any;
    }
    if (updateDto.analisesEletricas !== undefined) {
      laudo.analisesEletricas = updateDto.analisesEletricas as any;
    }
    if (updateDto.sistemaAr !== undefined) {
      laudo.sistemaAr = updateDto.sistemaAr as any;
    }
    if (updateDto.mecanismosAbertura !== undefined) {
      laudo.mecanismosAbertura = updateDto.mecanismosAbertura as any;
    }
    if (updateDto.revestimentos !== undefined) {
      laudo.revestimentos = updateDto.revestimentos as any;
    }
    if (updateDto.mobilias !== undefined) {
      laudo.mobilias = updateDto.mobilias as any;
    }
    if (updateDto.dadosExtra !== undefined) {
      laudo.dadosExtra = updateDto.dadosExtra;
    }

    return await this.laudoRepository.save(laudo);
  }

  async updateLaudoEndereco(
    id: string,
    updateDto: UpdateLaudoEnderecoDto,
    user: any,
  ): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({
      where: { id },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verifica permissão (dono ou admin/dev)
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === UserRole.ADMIN || user.role === UserRole.DEV;

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException(
        'Você não tem permissão para editar este laudo',
      );
    }

    // Atualizar apenas os campos de endereço fornecidos
    if (updateDto.cep !== undefined) {
      // Normalizar CEP removendo hífen se necessário
      laudo.cep = updateDto.cep.replace('-', '');
    }
    if (updateDto.rua !== undefined) {
      laudo.rua = updateDto.rua;
    }
    if (updateDto.numero !== undefined) {
      laudo.numero = updateDto.numero;
    }
    if (updateDto.complemento !== undefined) {
      laudo.complemento = updateDto.complemento;
    }
    if (updateDto.bairro !== undefined) {
      laudo.bairro = updateDto.bairro;
    }
    if (updateDto.cidade !== undefined) {
      laudo.cidade = updateDto.cidade;
    }
    if (updateDto.estado !== undefined) {
      laudo.estado = updateDto.estado;
    }

    // Atualizar campo endereco completo para compatibilidade
    const enderecoCompleto = [
      laudo.rua,
      laudo.numero,
      laudo.bairro,
      laudo.cidade,
      laudo.estado,
    ]
      .filter(Boolean)
      .join(', ');
    
    if (enderecoCompleto) {
      laudo.endereco = enderecoCompleto;
    }

    return await this.laudoRepository.save(laudo);
  }

  /**
   * Valida se todos os valores fornecidos existem como opções cadastradas
   */
  private async validateLaudoDetalhes(
    updateDto: UpdateLaudoDetalhesDto,
  ): Promise<void> {
    const valuesToValidate: string[] = [];

    // Coletar todos os valores não-vazios
    if (updateDto.atestado) {
      valuesToValidate.push(updateDto.atestado);
    }

    const collectValues = (obj: any) => {
      if (obj && typeof obj === 'object') {
        Object.values(obj).forEach((value) => {
          if (typeof value === 'string' && value.trim() !== '') {
            valuesToValidate.push(value);
          }
        });
      }
    };

    collectValues(updateDto.analisesHidraulicas);
    collectValues(updateDto.analisesEletricas);
    collectValues(updateDto.sistemaAr);
    collectValues(updateDto.mecanismosAbertura);
    collectValues(updateDto.revestimentos);
    collectValues(updateDto.mobilias);
    collectValues(updateDto.dadosExtra);

    if (valuesToValidate.length === 0) {
      return; // Nada para validar
    }

    // Buscar todas as opções válidas do banco
    const validOptions = await this.optionRepository.find({
      select: ['optionText'],
    });

    const validTexts = new Set(validOptions.map((opt) => opt.optionText));

    // Verificar se todos os valores fornecidos são válidos
    const invalidValues = valuesToValidate.filter(
      (value) => !validTexts.has(value),
    );

    if (invalidValues.length > 0) {
      throw new BadRequestException(
        `Os seguintes valores não são opções válidas: ${invalidValues.join(', ')}`,
      );
    }
  }

  async update(id: string, updateLaudoDto: UpdateLaudoDto): Promise<Laudo> {
    const laudo = await this.findOne(id);
    Object.assign(laudo, updateLaudoDto);
    return await this.laudoRepository.save(laudo);
  }



  async getDashboardStats(usuarioId: string): Promise<DashboardStatsDto> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Para DEV e ADMIN, mostrar quantidade ilimitada
    const imagensRestantes = [UserRole.DEV, UserRole.ADMIN].includes(usuario.role)
      ? 999999
      : usuario.quantidadeImagens;

    const [totalLaudos, emProcessamento, concluidos] = await Promise.all([
      this.laudoRepository.count({ where: { usuarioId } }),
      this.laudoRepository.count({
        where: { usuarioId, status: StatusLaudo.PROCESSANDO },
      }),
      this.laudoRepository.count({
        where: { usuarioId, status: StatusLaudo.CONCLUIDO },
      }),
    ]);

    return {
      totalLaudos,
      emProcessamento,
      concluidos,
      imagensRestantes,
    };
  }

  async getRecentLaudos(usuarioId: string, limit: number = 5): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return laudos.map((l) => ({
      id: l.id,
      usuarioId: l.usuarioId,
      endereco: l.endereco,
      rua: l.rua,
      numero: l.numero,
      complemento: l.complemento,
      bairro: l.bairro,
      cidade: l.cidade,
      estado: l.estado,
      cep: l.cep,
      tipoVistoria: l.tipoVistoria,
      tipoUso: l.tipoUso,
      tipoImovel: l.tipoImovel,
      tipo: l.tipo,
      unidade: l.unidade,
      status: l.status,
      tamanho: l.tamanho,
      pdfUrl: l.pdfUrl,
      totalAmbientes: l.totalAmbientes,
      totalFotos: l.totalFotos,
      latitude: l.latitude,
      longitude: l.longitude,
      enderecoCompletoGps: l.enderecoCompletoGps,
      incluirAtestado: l.incluirAtestado,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  async getImagensPdfPaginadas(
    laudoId: string,
    usuarioId: string,
    userRole: UserRole,
    page: number = 1,
    limit: number = 12,
  ): Promise<ImagensPdfResponseDto> {
    // Verificar se o laudo existe e pertence ao usuário
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verificar permissão
    const isOwner = laudo.usuarioId === usuarioId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException(
        'Você não tem permissão para visualizar as imagens deste laudo',
      );
    }

    // Buscar TODAS as imagens ordenadas por ambiente e ordem
    const todasImagens = await this.imagemRepository.find({
      where: { laudoId },
      order: {
        ambiente: 'ASC',
        ordem: 'ASC',
      },
    });

    if (todasImagens.length === 0) {
      return {
        data: [],
        meta: {
          currentPage: page,
          totalPages: 0,
          totalImages: 0,
          imagesPerPage: limit,
        },
      };
    }

    // Criar mapa de numeração de ambientes
    const ambientesMap = new Map<string, { numeroAmbiente: number; contador: number }>();
    let numeroAmbienteAtual = 0;
    let ambienteAnterior: string | null = null;

    todasImagens.forEach((img) => {
      if (img.ambiente !== ambienteAnterior) {
        numeroAmbienteAtual++;
        ambientesMap.set(img.ambiente, {
          numeroAmbiente: numeroAmbienteAtual,
          contador: 0,
        });
        ambienteAnterior = img.ambiente;
      }
    });

    // Aplicar paginação
    const inicio = (page - 1) * limit;
    const imagensPaginadas = todasImagens.slice(inicio, inicio + limit);

    // Resetar contadores para numeração correta
    const contadoresPorAmbiente = new Map<string, number>();
    ambientesMap.forEach((value, key) => {
      contadoresPorAmbiente.set(key, 0);
    });

    // Processar todas as imagens até a página atual para contagem correta
    for (let i = 0; i < inicio + imagensPaginadas.length && i < todasImagens.length; i++) {
      const img = todasImagens[i];
      const contadorAtual = contadoresPorAmbiente.get(img.ambiente) || 0;
      contadoresPorAmbiente.set(img.ambiente, contadorAtual + 1);

      // Só adicionar ao resultado se estiver na página atual
      if (i >= inicio && i < inicio + limit) {
        // Processado abaixo
      }
    }

    // Mapear imagens com numeração
    const imagensComNumeracao: ImagemPdfDto[] = imagensPaginadas.map((img, index) => {
      const infoAmbiente = ambientesMap.get(img.ambiente);
      
      // Recontar imagens deste ambiente até esta posição
      const posDaImagemNoArray = inicio + index;
      let contadorImagemNoAmbiente = 0;
      for (let i = 0; i <= posDaImagemNoArray; i++) {
        if (todasImagens[i].ambiente === img.ambiente) {
          contadorImagemNoAmbiente++;
        }
      }

      return {
        id: img.id,
        s3Key: img.s3Key,
        ambiente: img.ambiente,
        numeroAmbiente: infoAmbiente?.numeroAmbiente || 0,
        numeroImagemNoAmbiente: contadorImagemNoAmbiente,
        legenda: img.legenda || 'sem legenda',
        ordem: img.ordem,
        categoria: img.categoria,
        tipo: img.tipo,
      };
    });

    return {
      data: imagensComNumeracao,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(todasImagens.length / limit),
        totalImages: todasImagens.length,
        imagesPerPage: limit,
      },
    };
  }
}
