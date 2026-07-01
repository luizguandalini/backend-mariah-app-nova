import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Laudo } from '../laudos/entities/laudo.entity';
import { LaudosService, PaginatedLaudosResult } from '../laudos/laudos.service';
import { DriveYearDto } from './dto/drive-year.dto';
import { DriveMonthDto } from './dto/drive-month.dto';

const BUSINESS_TZ = 'America/Sao_Paulo';
const YEAR_EXPR = `EXTRACT(YEAR FROM (laudo.created_at AT TIME ZONE '${BUSINESS_TZ}'))`;
const MONTH_EXPR = `EXTRACT(MONTH FROM (laudo.created_at AT TIME ZONE '${BUSINESS_TZ}'))`;

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Navegação "Drive" (DEV/ADMIN) sobre todos os laudos do sistema.
 *
 * Dois modos: (1) lista flat mais recente primeiro e (2) cronológico
 * ano → mês → laudos. Ano/mês são derivados de `created_at` no timezone de
 * negócio `America/Sao_Paulo`, de forma consistente entre as contagens e o
 * recorte da listagem (ver `saoPauloMonthStart`).
 */
@Injectable()
export class DriveService {
  constructor(
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    private readonly laudosService: LaudosService,
  ) {}

  /** Modo lista: todos os laudos, mais recente primeiro, paginado. */
  async listLaudos(page: number, limit: number): Promise<PaginatedLaudosResult> {
    return this.laudosService.findAllForDrive(page, limit);
  }

  /** Anos que possuem laudos, com contagem, do mais recente para o mais antigo. */
  async listYears(): Promise<DriveYearDto[]> {
    const rows = await this.laudoRepository
      .createQueryBuilder('laudo')
      .select(YEAR_EXPR, 'year')
      .addSelect('COUNT(*)', 'count')
      .groupBy(YEAR_EXPR)
      .orderBy('year', 'DESC')
      .getRawMany<{ year: string; count: string }>();

    return rows.map((r) => ({ year: Number(r.year), count: Number(r.count) }));
  }

  /** Meses (1–12) com laudos dentro de um ano, com contagem, mais recente primeiro. */
  async listMonths(year: number): Promise<DriveMonthDto[]> {
    this.validateYear(year);

    const inicio = this.saoPauloMonthStart(year, 1);
    const fim = this.saoPauloMonthStart(year + 1, 1);

    const rows = await this.laudoRepository
      .createQueryBuilder('laudo')
      .select(MONTH_EXPR, 'month')
      .addSelect('COUNT(*)', 'count')
      .where('laudo.created_at >= :inicio', { inicio })
      .andWhere('laudo.created_at < :fim', { fim })
      .groupBy(MONTH_EXPR)
      .orderBy('month', 'DESC')
      .getRawMany<{ month: string; count: string }>();

    return rows.map((r) => ({ month: Number(r.month), count: Number(r.count) }));
  }

  /** Laudos de um ano/mês específico, paginados, mais recente primeiro. */
  async listLaudosByMonth(
    year: number,
    month: number,
    page: number,
    limit: number,
  ): Promise<PaginatedLaudosResult> {
    this.validateYear(year);
    this.validateMonth(month);

    const inicio = this.saoPauloMonthStart(year, month);
    const fim =
      month === 12
        ? this.saoPauloMonthStart(year + 1, 1)
        : this.saoPauloMonthStart(year, month + 1);

    return this.laudosService.findAllForDrive(page, limit, { inicio, fim });
  }

  /**
   * Instante UTC correspondente à meia-noite do dia 1 de `year`/`month` no
   * horário de São Paulo. O Brasil não adota horário de verão desde 2019 e SP
   * é UTC-3 o ano todo, então a meia-noite local é 03:00 UTC — o mesmo recorte
   * produzido por `AT TIME ZONE 'America/Sao_Paulo'` nas agregações, mantendo
   * a soma das contagens dos meses igual à contagem do ano.
   */
  private saoPauloMonthStart(year: number, month: number): Date {
    return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  }

  private validateYear(year: number): void {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      throw new BadRequestException(
        `Ano inválido: ${year}. Use um valor entre ${MIN_YEAR} e ${MAX_YEAR}.`,
      );
    }
  }

  private validateMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        `Mês inválido: ${month}. Use um valor entre 1 e 12.`,
      );
    }
  }
}
