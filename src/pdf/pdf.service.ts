import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { RabbitMQService } from '../queue/rabbitmq.service';
import { UploadsService } from '../uploads/uploads.service';
import puppeteer from 'puppeteer';
import { QueueGateway } from '../queue/queue.gateway';
import * as fs from 'fs';
import * as path from 'path';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { UsersService } from '../users/users.service';
import * as QRCode from 'qrcode';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemRepository: Repository<ImagemLaudo>,
    @InjectRepository(LaudoSection)
    private readonly sectionRepository: Repository<LaudoSection>,
    @InjectRepository(LaudoOption)
    private readonly optionRepository: Repository<LaudoOption>,
    private readonly uploadsService: UploadsService,
    private readonly queueGateway: QueueGateway,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Ponto de entrada para geração do PDF
   */
  async generateInternal(laudoId: string, userId: string): Promise<string> {
    this.updateStatus(laudoId, 'PROCESSING', 0);

    try {
      this.logger.log(`🚀 Iniciando geração de PDF para laudo ${laudoId}`);

      // 1. Buscar Dados do Laudo
      const laudo = await this.laudoRepository.findOne({ 
        where: { id: laudoId },
        relations: ['usuario'],
      });
      
      if (!laudo) throw new Error('Laudo não encontrado');
      
      // Capturar URL antiga para deleção posterior
      const oldPdfUrl = laudo.pdfUrl;
      this.logger.log(`📋 PDF antigo encontrado: ${oldPdfUrl ? 'SIM' : 'NÃO'}`);
      if (oldPdfUrl) {
        this.logger.log(`📋 URL do PDF antigo: ${oldPdfUrl.substring(0, 100)}...`);
      }

      // 2. Buscar Imagens ordenadas
      const imagens = await this.imagemRepository.find({
        where: { laudoId },
        order: { ambiente: 'ASC', ordem: 'ASC' },
      });

      // 3. Derivar Ambientes das Imagens
      const ambientesSet = new Set<string>();
      // Manter a ordem de aparecimento ou alfabética? 
      // O front parece usar ordem de inserção/retorno da API.
      // Vamos usar ordem de aparecimento nas fotos (que estão por ordem).
      imagens.forEach(img => {
          if (img.ambiente) ambientesSet.add(img.ambiente);
      });
      const ambientes = Array.from(ambientesSet).map((nome, index) => ({ 
          nome, 
          originalIndex: index + 1 
      }));

      // 4. Buscar Seções para o Relatório
      const sections = await this.sectionRepository.find({
        order: { createdAt: 'ASC' },
        relations: ['questions'], // Assumindo relação
      });

      // 5. Buscar Configurações do Usuário
      const config = await this.usersService.getConfiguracoesPdf(userId);

      // --- Processamento ---

      // Progresso 10% -> Processar Imagens
      this.updateStatus(laudoId, 'PROCESSING', 10);
      const imagensProcessadas = await this.processImagesForPdf(imagens, laudoId);
      
      // Progresso 60% -> Renderizar HTML
      this.updateStatus(laudoId, 'PROCESSING', 60);
      
      const htmlContent = await this.buildHtml(laudo, imagensProcessadas, ambientes, sections, config);

      // Progresso 80% -> Gerar PDF
      this.updateStatus(laudoId, 'PROCESSING', 80);
      const pdfBuffer = await this.renderPdf(htmlContent);

      // Progresso 95% -> Upload
      this.updateStatus(laudoId, 'PROCESSING', 95);
      const s3Key = `laudos/pdf/${laudoId}_${Date.now()}.pdf`;
      const publicUrl = await this.uploadsService.uploadPdfBuffer(pdfBuffer, s3Key);

      // Se sucesso, deletar antigo se existir
      if (oldPdfUrl) {
          this.logger.log(`🔍 Tentando deletar PDF antigo...`);
          try {
             // Extrair key da URL. Assumindo URL assinada ou pública padrão S3.
             // Ex: https://bucket.s3.region.amazonaws.com/laudos/pdf/xxx.pdf?signature...
             // Ou só a parte do path se for cloudfront.
             // O jeito mais seguro é tentar extrair a parte depois do dominio.
             // Mas como guardamos 'laudos/pdf/...' como key no upload, podemos tentar extrair isso.
             
             // WORKAROUND: O `uploadPdfBuffer` retorna uma URL assinada completa.
             // O `laudo.pdfUrl` tem essa URL.
             // A chave S3 está embutida na URL. 
             // Padrão S3 Key: laudos/pdf/{id}_{timestamp}.pdf
             
             // Regex simples para pegar a key
             const match = oldPdfUrl.match(/(laudos\/pdf\/[^?]+)/);
             this.logger.log(`🔍 Regex match result: ${JSON.stringify(match)}`);
             if (match && match[1]) {
                 const oldKey = match[1];
                 this.logger.log(`🗑️ Removendo PDF antigo: ${oldKey}`);
                 await this.uploadsService.deleteFile(oldKey);
                 this.logger.log(`✅ PDF antigo deletado com sucesso: ${oldKey}`);
             } else {
                 this.logger.warn(`⚠️ Não foi possível extrair chave S3 da URL: ${oldPdfUrl}`);
             }
          } catch(err) {
              this.logger.warn('❌ Falha ao tentar remover PDF antigo', err);
          }
      } else {
          this.logger.log(`ℹ️ Nenhum PDF antigo para deletar (primeiro PDF deste laudo)`);
      }

      // Finalizar
      await this.laudoRepository.update(laudoId, {
        pdfStatus: 'COMPLETED',
        pdfProgress: 100,
        pdfUrl: publicUrl,
      });
      
      this.queueGateway.notifyPdfProgress(laudoId, {
         laudoId,
         status: 'COMPLETED',
         progress: 100,
         url: publicUrl,
      });

      return publicUrl;
    } catch (error) {
      this.logger.error(`❌ Erro gerando PDF laudo ${laudoId}:`, error);
      
      await this.laudoRepository.update(laudoId, {
        pdfStatus: 'ERROR',
        pdfProgress: 0,
      });
      
      this.queueGateway.notifyPdfProgress(laudoId, {
         laudoId,
         status: 'ERROR',
         progress: 0,
         error: error.message,
      });
      
      throw error;
    }
  }

  private updateStatus(laudoId: string, status: string, progress: number) {
    this.laudoRepository.update(laudoId, {
        pdfStatus: status,
        pdfProgress: progress,
    }).catch(err => this.logger.error('Erro ao atualizar status PDF DB', err));

    this.queueGateway.notifyPdfProgress(laudoId, {
        laudoId,
        status,
        progress
    });
  }

  private async processImagesForPdf(imagens: ImagemLaudo[], laudoId: string): Promise<any[]> {
    const total = imagens.length;
    const processed = [];
    const BATCH_SIZE = 5;
    
    // 1. Obter URLs assinadas
    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = imagens.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (img) => {
            try {
                const url = await this.uploadsService.getSignedUrlForAi(img.s3Key);
                return { ...img, publicUrl: url };
            } catch (e) {
                this.logger.error(`Erro processando imagem ${img.id}`, e);
                return null;
            }
        }));
        processed.push(...results.filter(r => r !== null));
        
        const loopPercent = (i + batch.length) / total;
        const totalProgress = 10 + Math.round(loopPercent * 50); 
        this.updateStatus(laudoId, 'PROCESSING', totalProgress);
    }

    // 2. Calcular números (numeroAmbiente e numeroImagemNoAmbiente)
    // Agrupar por ambiente para saber a ordem
    const ambientesMap = new Map<string, any[]>();
    processed.forEach(img => {
        const amb = img.ambiente || 'AMBIENTE';
        if (!ambientesMap.has(amb)) {
            ambientesMap.set(amb, []);
        }
        ambientesMap.get(amb).push(img);
    });

    // Atribuir números
    let ambienteIndex = 1;
    const finalImages = [];

    // Iterar na ordem que aparecem (preservando ordem original do array processed)
    // Para garantir ordem de ambientes, percorremos o map na ordem de inserção
    for (const [nomeAmbiente, imgsDoAmbiente] of ambientesMap.entries()) {
         imgsDoAmbiente.forEach((img, index) => {
             img.numeroAmbiente = ambienteIndex;
             img.numeroImagemNoAmbiente = index + 1;
             finalImages.push(img);
         });
         ambienteIndex++;
    }

    // Reordenar finalImages para garantir que a ordem original do array seja respeitada se necessário, 
    // mas geralmente agrupado por ambiente é o desejado.
    // Se a ordem original for misturada (ambientes intercalados), essa logica agrupa.
    // O front parece agrupar. Vamos devolver agrupado.
    
    return finalImages;
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
       executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
       headless: true,
       args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    // Aumentar timeout para 60s (imagens pesadas)
    await page.setDefaultNavigationTimeout(60000); 
    
    await page.setContent(html, { 
        waitUntil: 'networkidle0',
        timeout: 60000 
    });
    
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
        timeout: 60000
    });
    await browser.close();
    return Buffer.from(pdf);
  }

  // --- HTML BUILDERS ---

  private async buildHtml(laudo: Laudo, imagens: any[], ambientes: any[], sections: LaudoSection[], config: any): Promise<string> {
    const css = this.getCss(config);
    const cover = this.getCoverHtml(laudo);
    const infoPage = this.getInfoPageHtml(laudo, ambientes);
    const photos = this.getPhotosHtml(imagens, laudo);
    const report = await this.getReportHtml(laudo, sections);
    const signatures = this.getSignaturesHtml(laudo);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
          <style>${css}</style>
        </head>
        <body>
            ${cover}
            <div class="page-break"></div>
            ${infoPage}
            <div class="page-break relative"></div>
            ${photos}
            <div class="page-break"></div>
            ${report}
            <div class="page-break"></div>
            ${signatures}
            <script>
              document.querySelectorAll('.page-container').forEach(function(page, i) {
                var footer = document.createElement('div');
                footer.className = 'page-footer';
                footer.textContent = String(i + 1);
                page.appendChild(footer);
              });
            </script>
        </body>
      </html>
    `;
  }

  private getSignaturesHtml(laudo: Laudo): string {
    const dataRef = laudo.dataVistoria || laudo.createdAt || new Date();
    const dataFull = new Date(dataRef);
    const dia = dataFull.getDate().toString().padStart(2, '0');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mes = meses[dataFull.getMonth()];
    const ano = dataFull.getFullYear();
    const dataExibicao = laudo.dataRelatorio || `${dia} de ${mes} de ${ano}`;
    
    const cidadeDb = laudo.cidade || '';
    const cidade = (cidadeDb === '' || cidadeDb.toUpperCase() === 'SP') ? 'São Paulo' : cidadeDb;

    return `
      <div class="page-container page-standard">
        <div style="height: 35px;"></div>
        
        <h2 class="assinaturas-titulo">ASSINATURAS</h2>
        
        <p class="assinaturas-texto">
          Declaram as partes estarem cientes das imagens e textos apresentados no presente
          termo, estando em conformidade com a vontade dos contratantes que, "As Partes e as
          testemunhas envolvidas neste instrumento afirmam e declaram que esse poderá ser
          assinado presencialmente ou eletronicamente, sendo as assinaturas consideradas
          válidas, vinculantes e executáveis, desde que firmadas pelos representantes legais das
          Partes. e pôr estarem justos e contratados, assinam o presente, para um só efeito, diante
          de 02 (duas) testemunhas.
        </p>

        <div class="assinaturas-data">
          ${cidade}, ${dataExibicao}
        </div>

        <!-- LOCADOR -->
        <div class="assinaturas-box-wrapper">
            <div class="assinaturas-box-header">LOCADOR(A)</div>
            <div class="assinaturas-box">
                <div class="assinaturas-box-content">
                    <div class="assinaturas-box-col">
                        <div class="assinaturas-valor">${laudo.locadorNome || ''}</div>
                        <div class="assinaturas-label">Qualificação / Nome</div>
                    </div>
                    <div class="assinaturas-box-col">
                        <div class="assinaturas-valor">${laudo.locadorAssinatura || ''}</div>
                        <div class="assinaturas-label">Assinatura</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- LOCATÁRIO -->
        <div class="assinaturas-box-wrapper">
            <div class="assinaturas-box-header">LOCATÁRIO(A)</div>
            <div class="assinaturas-box">
                <div class="assinaturas-box-content">
                    <div class="assinaturas-box-col">
                        <div class="assinaturas-valor">${laudo.locatarioNome || ''}</div>
                        <div class="assinaturas-label">Qualificação / Nome</div>
                    </div>
                    <div class="assinaturas-box-col">
                        <div class="assinaturas-valor">${laudo.locatarioAssinatura || ''}</div>
                        <div class="assinaturas-label">Assinatura</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TESTEMUNHAS -->
        <div class="testemunhas-grid">
            <div class="testemunha-item">
                <div class="testemunha-linha">
                    <strong>Nome:</strong>
                    <span class="testemunha-valor">${laudo.testemunha1Nome || ''}</span>
                </div>
                <div class="testemunha-linha">
                    <strong>RG:</strong>
                    <span class="testemunha-valor">${laudo.testemunha1Rg || ''}</span>
                </div>
            </div>

            <div class="testemunha-item">
                <div class="testemunha-linha">
                    <strong>Nome:</strong>
                    <span class="testemunha-valor">${laudo.testemunha2Nome || ''}</span>
                </div>
                <div class="testemunha-linha">
                    <strong>RG:</strong>
                    <span class="testemunha-valor">${laudo.testemunha2Rg || ''}</span>
                </div>
            </div>
        </div>
      </div>
    `;
  }

  private getCss(config: any): string {
     return `
        * { box-sizing: border-box; }
        
        body { 
            margin: 0; padding: 0; 
            font-family: "Roboto", Arial, sans-serif; 
            background: #fff; color: #000;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }

        .page-break { page-break-after: always; }
        
        .page-container {
            width: 210mm; height: 297mm; position: relative;
            background-color: #fff;
            overflow: hidden;
            display: block;
        }

        .page-cover {
            padding: 10mm 20mm 20mm 20mm;
            border-top: 8px solid #6f2f9e;
        }

        .page-standard {
            padding: 20mm;
        }

        .page-dynamic {
            padding: ${config.margemPagina}px;
        }

        /* CAPA */
        .div-laudo-de-vistoria { background-color: #d9d9d9; margin-bottom: 20px; margin-top: 35px; }
        .div-laudo-de-vistoria h1 { text-align: center; font-size: 25px; margin: 0; padding: 10px 0; font-weight: 700; }
        
        .div-informacoes-da-vistoria h2 { margin: 0px; font-size: 14px; border-bottom: solid #c0c0c0 1px; padding-bottom: 2px; font-weight: 700; }
        
        .campos { width: 100%; margin-top: 9px; display: flex; flex-direction: column; gap: 4px; }
        .linha-campos { display: flex; width: 100%; gap: 4px; align-items: stretch; }
        
        .formatacao-campos { display: flex; background-color: #d9d9d9; padding: 2px; align-items: baseline; }
        .formatacao-campos > strong { font-size: 12px; margin-left: 2px; white-space: nowrap; }
        .formatacao-campos > p { margin: 0px; font-size: 12px; margin-left: 3px; word-wrap: break-word; }
        .valor-campo { text-transform: capitalize; }
        
        .campo-curto { width: 170px; flex-shrink: 0; min-height: 100%; }
        .campo-longo { flex: 1; min-height: 100%; }
        
        .div-metodologia { margin-top: 17px; }
        .div-metodologia > h1 { font-size: 14px; border-bottom: solid #c0c0c0 1px; margin: 0; padding-bottom: 2px; font-weight: 700; }
        .div-metodologia > p { font-weight: 400; font-size: 16px; text-align: justify; margin: 10px 0; line-height: 1.4; }

        /* TERMOS & AMBIENTES */
        .termos-gerais h2 { font-size: 14px; font-weight: 700; border-bottom: 1px solid #c0c0c0; padding-bottom: 4px; margin-bottom: 15px; text-transform: uppercase; }
        .termos-gerais p { font-size: 12px; text-align: justify; line-height: 1.5; margin-bottom: 15px; }
        
        .ambientes-section { margin-top: 30px; }
        .ambientes-section h2 { font-size: 14px; font-weight: 700; border-bottom: 1px solid #c0c0c0; padding-bottom: 4px; margin-bottom: 15px; text-transform: uppercase; }
        
        .ambientes-container { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; }
        .ambiente-col { background-color: #d9d9d9; padding: 8px; min-height: 480px; display: flex; flex-direction: column; gap: 8px; }
        .ambiente-item { font-size: 11px; line-height: 1.2; word-wrap: break-word; }

        /* FOTOS */
        .grid-fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${config.espacamentoVertical}px ${config.espacamentoHorizontal}px; margin-top: 0; }
        .foto-card { break-inside: avoid; }
        .foto-container { border: 1px solid #9ca3af; margin-bottom: 4px; overflow: hidden; }
        .foto-img { width: 100%; height: 200px; object-fit: cover; object-position: center; display: block; }
        .foto-ambiente { font-weight: bold; font-size: 10px; text-transform: uppercase; line-height: 1.2; text-align: left; }
        .foto-legenda { font-size: 9px; line-height: 1.4; text-align: left; }
        .foto-legenda strong { margin-right: 4px; }

        /* RELATÓRIO */
        .relatorio-titulo { font-size: 14px; font-weight: 700; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 20px; text-transform: uppercase; }
        .relatorio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
        .relatorio-coluna { display: flex; flex-direction: column; gap: 10px; }
        
        .grupo { margin-bottom: 15px; break-inside: avoid; }
        .categoria-box { 
            background-color: #999; color: #fff; 
            padding: 5px 10px; font-weight: 700; 
            margin-bottom: 2px; font-size: 11px; text-transform: uppercase; 
        }
        .item-row { 
            display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
            background-color: #d9d9d9; 
            padding: 5px 10px; margin-bottom: 2px; font-size: 11px; 
        }
        .item-label { font-weight: 500; color: #000; flex: 1; min-width: 0; line-height: 1.3; }
        .item-valor { font-weight: 700; font-size: 10px; text-align: right; max-width: 45%; min-width: 92px; text-transform: lowercase; line-height: 1.3; overflow-wrap: anywhere; }
        .item-valor-sem-irregularidades { color: #15803d; }
        .item-valor-com-apontamento { color: #dc2626; }

        /* DOWNLOAD DE FOTOS */
        .download-fotos-section { margin-top: 24px; border-top: 2px solid #000; padding-top: 10px; }
        .download-fotos-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; }
        .download-fotos-content { display: flex; align-items: flex-start; gap: 20px; }
        .download-fotos-text { flex: 1; font-size: 11px; line-height: 1.6; text-align: justify; color: #000; }
        .download-fotos-qrcode img { width: 100px; height: 100px; display: block; }

        /* ENCERRAMENTO */
        .encerramento-section { margin-top: 20px; padding-top: 0; }
        .encerramento-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 0 0 4px 0; }
        .encerramento-divisor { border: none; border-top: 2px solid #000; margin: 0 0 10px 0; }
        .encerramento-text { font-size: 11px; line-height: 1.6; text-align: justify; color: #000; margin: 0 0 8px 0; }
        .encerramento-fechamento { font-size: 11px; color: #000; margin: 0 0 20px 0; }
        .encerramento-rodape { position: absolute; bottom: 15mm; left: 20mm; right: 20mm; display: flex; align-items: flex-end; justify-content: space-between; }
        .encerramento-responsavel { font-size: 10px; font-weight: 700; line-height: 1.6; color: #000; }
        .encerramento-logo-bloco { display: flex; flex-direction: column; align-items: center; width: 170px; }
        .encerramento-logo-bloco img { width: 100%; height: auto; display: block; margin-bottom: 4px; }
        .encerramento-logo-nome { font-size: 9px; font-weight: 700; text-transform: uppercase; text-align: center; color: #000; width: 100%; letter-spacing: 0.5px; }
        
        .avoid-break { page-break-inside: avoid; }

        /* RODAPÉ - NÚMERO DE PÁGINA */
        .page-footer {
            position: absolute;
            bottom: 10mm;
            right: 15mm;
            font-family: 'Roboto', Arial, sans-serif;
            font-size: 10px;
            color: #555;
        }

        /* ASSINATURAS */
        .assinaturas-titulo { font-size: 14px; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #c0c0c0; padding-bottom: 4px; margin-bottom: 20px; }
        .assinaturas-texto { font-size: 11px; line-height: 1.6; text-align: justify; margin-bottom: 40px; }
        .assinaturas-data { text-align: center; font-size: 12px; margin-bottom: 60px; }
        
        .assinaturas-box-wrapper { position: relative; width: 100%; margin-bottom: 40px; break-inside: avoid; }
        .assinaturas-box { display: flex; flex-direction: column; width: 100%; border: 1px solid #000; height: 120px; }
        .assinaturas-box-header { font-size: 11px; margin-bottom: 2px; text-transform: uppercase; position: absolute; top: -15px; left: 0; background: #fff; padding-right: 5px; z-index: 10; font-weight: 700; line-height: 1; }
        .assinaturas-box-content { display: flex; height: 100%; }
        .assinaturas-box-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; position: relative; }
        .assinaturas-box-col:first-child { border-right: 1px solid #000; }
        .assinaturas-label { border-top: 1px solid #000; padding-top: 2px; font-size: 10px; width: 100%; }
        .assinaturas-valor { font-family: "Roboto", sans-serif; font-size: 10px; text-align: center; margin-bottom: 5px; min-height: 15px; }

        .testemunhas-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px; break-inside: avoid; }
        .testemunha-item { display: flex; flex-direction: column; gap: 5px; }
        .testemunha-linha { display: flex; align-items: baseline; border-bottom: 1px solid #000; font-size: 11px; padding-bottom: 2px; }
        .testemunha-linha strong { margin-right: 5px; min-width: 40px; }
        .testemunha-valor { font-family: "Roboto", sans-serif; font-size: 11px; }
     `;
  }

  private getCoverHtml(laudo: Laudo): string {
      const METODOLOGIA_TEXTS = [
        "Este documento tem como objetivo garantir às partes da locação o registro do estado de entrega do imóvel, integrando-se como anexo ao contrato formado. Ele concilia as obrigações contratuais e serve como referência para a aferição de eventuais alterações no imóvel ao longo do período de uso.",
        "O laudo de vistoria foi elaborado de maneira técnica por um especialista qualificado, que examinou critérios específicos para avaliar todos os aspectos relevantes, desde apontamentos estruturais aparentes até pequenos detalhes construtivos e acessórios presentes no imóvel. O objetivo foi registrar, de forma clara e objetiva, por meio de textos e imagens, qualquer apontamento ou irregularidade, garantindo uma abordagem sistemática, imparcial e organizada em ordem cronológica, com separação por ambientes e legendas contidas e numerações sequenciais.",
        "O documento inclui fotos de todas as paredes, pisos, tetos, portas, janelas e demais elementos que compõem o imóvel e suas instalações. As imagens foram capturadas com angulação precisa, permitindo análises previstas do estado de conservação atual do imóvel e verificações futuras. Fica reservado o direito, a qualquer tempo, das partes identificadas, por meio das imagens, qualquer ponto que não tenha sido especificado por escrito.",
        "Os registros identificados como irregularidades ou avarias estão destacados neste laudo sob a denominação \"APONTAMENTOS\" e podem ser facilmente localizados utilizando o recurso de busca por palavras.",
        "Este laudo não emprega termos subjetivos, como \"bom\", \"regular\" ou \"ótimo\" estado, nas análises. A descrição foi construída de forma objetiva, baseada exclusivamente em fatos observáveis, com o objetivo de evitar interpretações divergentes que possam surgir de perspectivas pessoais e garantir que as informações registradas sejam precisas e imparciais.",
        "Os elementos adicionais ao imóvel, como acessórios, eletrodomésticos, equipamentos de arcondicionado, dispositivos em geral, lustres ou luminárias, mobília não embutida, entre outros, serão identificados no laudo pela denominação \"ITEM\"."
      ];

      const METODOLOGIA_SAIDA_TEXTS = [
        "Este documento traz como condições de devolução do imóvel, o qual será utilizado para averiguação comparativa com a vistoria de entrada, a fim de constatar possíveis divergências que possam ter surgido no decorrer da locação.",
        "Caberá às partes utilizar as análises apresentadas neste laudo como base comparativa com o laudo anterior, considerando o grau de relevância dos apontamentos, a atribuição de responsabilidade e a necessidade de reparo imediato dos danos causados pela locatária durante o período de uso. Conforme estabelece o art. 23, inciso III, da Lei nº 8.245/91, cabe ao locatário a restituição do imóvel no mesmo estado em que o recebeu, de acordo com o laudo de vistoria inicial. Deve-se analisar, em especial, equipamentos elétricos, quadros de distribuição de energia, instalações hidráulicas e elétricas, sistemas de ar condicionado, sistemas de aquecimento em geral ou danos decorrentes do mau uso, tais como: danos ao encanamento provocados pelo descarte de objetos em ralos e vasos sanitários, conservação de móveis, eletrodomésticos ou bens de razão estrutural, como portas, janelas, esquadrias, pias, armários, entre outros.",
        "O método utilizado na vistoria consiste em uma análise meticulosa, baseando-se em procedimentos técnicos para avaliar todos os aspectos relevantes, desde apontamentos estruturais visíveis até pequenos detalhes construtivos e acessórios presentes no imóvel. Todos os aspectos são registrados de forma clara e objetiva, por textos e imagens, incluindo qualquer apontamento ou irregularidade aparente, salvo vício oculto. A abordagem é imparcial, e as fotos de cada ambiente trazem todos os ângulos necessários, como paredes, pisos, tetos, portas e janelas, entre outros que compõem o imóvel e suas instalações. As imagens são agrupadas e numeradas por ambiente, de modo que, mesmo na ausência de texto descrevendo algum apontamento, poderão ser identificadas por meio da interpretação dos registros fotográficos.",
        "Os registros encontrados como irregularidades ou avarias são indicados neste laudo de vistoria pela menção da palavra \"APONTAMENTO\"."
      ];

      const tipoUso = (laudo.tipoUso || '').toLowerCase();
      const tipo = (laudo.tipoImovel || laudo.tipo || '').toLowerCase();
      const unidade = laudo.unidade || laudo.numero || '';
      const tamanho = laudo.tamanho || '';
      const tipoVistoria = (laudo.tipoVistoria || '').toLowerCase();
      const endereco = laudo.endereco || '';
      const cep = laudo.cep || '';
      
      let dataRealizacao = '';
      if (laudo.dataVistoria) {
          const date = new Date(laudo.dataVistoria);
          dataRealizacao = date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      } else if (laudo.createdAt) {
          const date = new Date(laudo.createdAt);
          dataRealizacao = date.toLocaleDateString('pt-BR');
      } 
      
      const isSaida = tipoVistoria === 'saída' || tipoVistoria === 'saida';
      const textosMetodologia = isSaida ? METODOLOGIA_SAIDA_TEXTS : METODOLOGIA_TEXTS;

      return `
        <div class="page-container page-cover">
            <div style="height: 35px;"></div>
            
            <div class="div-laudo-de-vistoria">
                <h1>LAUDO DE VISTORIA</h1>
            </div>
            
            <div class="div-informacoes-da-vistoria">
                <h2>INFORMAÇÕES DA VISTORIA</h2>
                <div class="campos">
                    <div class="linha-campos">
                        <div class="formatacao-campos campo-curto">
                            <strong>Uso:</strong> <p class="valor-campo">${tipoUso}</p>
                        </div>
                        <div class="formatacao-campos campo-longo">
                            <strong>Endereço:</strong> <p>${endereco}</p>
                        </div>
                    </div>
                    <div class="linha-campos">
                        <div class="formatacao-campos campo-curto">
                            <strong>Tipo:</strong> <p class="valor-campo">${tipo}</p>
                        </div>
                        <div class="formatacao-campos campo-longo">
                            <strong>CEP:</strong> <p>${cep}</p>
                        </div>
                    </div>
                    <div class="linha-campos">
                        <div class="formatacao-campos campo-curto">
                            <strong>Unidade:</strong> <p>${unidade}</p>
                        </div>
                        <div class="formatacao-campos campo-longo">
                            <strong>Tamanho do imóvel:</strong> <p>${tamanho}</p>
                        </div>
                    </div>
                    <div class="linha-campos">
                        <div class="formatacao-campos campo-curto">
                            <strong>Tipo de Vistoria:</strong> <p class="valor-campo">${tipoVistoria}</p>
                        </div>
                        <div class="formatacao-campos campo-longo">
                            <strong>Realizada em:</strong> <p>${dataRealizacao}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="div-metodologia">
                <h1>METODOLOGIA</h1>
                ${textosMetodologia.map(t => `<p>${t}</p>`).join('')}
            </div>
        </div>
      `;
  }
  
  private getInfoPageHtml(laudo: Laudo, ambientes: any[] = []): string {
      // Organizar ambientes em 4 colunas (máx 18 itens por coluna)
      const itemsPerColumn = 18;
      const columns = [[], [], [], []];
      
      ambientes.forEach((amb, index) => {
          const colIndex = Math.floor(index / itemsPerColumn);
          if (colIndex < 4) {
              columns[colIndex].push(amb);
          }
      });
      
      return `
        <div class="page-container page-standard">
            <div style="height: 35px;"></div>
            
            <div class="termos-gerais">
                <h2>Termos Gerais</h2>
                <p>
                    É obrigação do locatário o reparo imediato dos danos causados por si mesmo ou por
                    terceiros durante a vigência do contrato de locação, cabendo ao locatário restituir o
                    imóvel no mesmo estado em que o recebeu, de acordo com este laudo de vistoria,
                    comprometendo-se com o zelo e promovendo a manutenção preventiva do mesmo e de
                    seus equipamentos porventura existentes, em especial, equipamentos elétricos, quadros
                    de distribuição de energia, instalações hidráulicas, elétricas, sistemas de ar, sistema de
                    aquecimento em geral ou danos decorrentes do mau uso, tais como: danos ao
                    encanamento provocados pelo descarte de objetos em ralos, em vasos sanitários,
                    conservação dos móveis ou de bens de razão estrutural, como portas, janelas, esquadrias,
                    pias, gabinetes, entre outros.
                </p>
                <p>
                    O locatário será isento de responsabilidade quanto aos desgastes naturais decorrentes do
                    uso normal e zeloso do imóvel, desde que tais condições sejam compatíveis com o
                    período de locação e não decorram de negligência, mau uso ou ausência de manutenção
                    regular. Eventuais danos que ultrapassem o desgaste esperado ou sejam causados por
                    uso inadequado serão de responsabilidade do locatário, firmando compromisso do uso
                    zeloso pelo período em que se der início a locação até a efetiva devolução das chaves.
                </p>
            </div>
            
            <div class="ambientes-section">
                <h2>Ambientes</h2>
                <div class="ambientes-container">
                    ${columns.map(col => `
                        <div class="ambiente-col">
                            ${col.map((amb: any) => `
                                <div class="ambiente-item">
                                    ${amb.originalIndex}. ${amb.nome.replace(/^\d+\s*-\s*/, '')}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
      `;
  }

  private getPhotosHtml(imagens: any[], laudo: Laudo): string {
      const PHOTOS_PER_PAGE = 12; 
      let html = '';
      
      for(let i=0; i<imagens.length; i+=PHOTOS_PER_PAGE) {
          const pagePhotos = imagens.slice(i, i+PHOTOS_PER_PAGE);
          
          html += `
            <div class="page-container page-dynamic">
                <div class="grid-fotos">
                    ${pagePhotos.map(img => {
                        const ambienteSemNumero = (img.ambiente || 'AMBIENTE').replace(/^\d+\s*-\s*/, '');
                        return `
                        <div class="foto-card">
                            <div class="foto-container">
                                <img src="${img.publicUrl}" class="foto-img" />
                            </div>
                            <div class="foto-ambiente">${ambienteSemNumero}</div>
                            <div class="foto-legenda">
                                <strong>${img.numeroAmbiente} (${img.numeroImagemNoAmbiente})</strong> ${img.legenda || ''}
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
          `;
          
          if (i + PHOTOS_PER_PAGE < imagens.length) {
              html += '<div class="page-break"></div>';
          }
      }
      return html;
  }

  private async getReportHtml(laudo: Laudo, sections: LaudoSection[] = []): Promise<string> {
      // 1. Normalização de Mapeamento (Igual ao Frontend - chaves sem espaços)
      const SECTION_FIELD_MAP: Record<string, { dataKey: string; fields?: string[] }> = {
            "atestadodavistoria": { dataKey: "atestado" },
            "analiseshidraulicas": { dataKey: "analisesHidraulicas", fields: ["fluxo_agua", "vazamentos"] },
            "analiseseletricas": { dataKey: "analisesEletricas", fields: ["funcionamento", "disjuntores"] },
            "sistemadear": { dataKey: "sistemaAr", fields: ["ar_condicionado", "aquecimento"] },
            "mecanismosdeabertura": { dataKey: "mecanismosAbertura", fields: ["portas", "macanetas", "janelas"] },
            "revestimentos": { dataKey: "revestimentos", fields: ["tetos", "pisos", "bancadas"] },
            "mobilias": { dataKey: "mobilias", fields: ["fixa", "nao_fixa"] },
      };

      // Normalização idêntica ao FRONTEND: remove acentos e TODOS os espaços
      const normalizeSectionName = (name: string) => name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
      
      const details = laudo as any; // Cast para acessar indices dinâmicos
      this.logger.log(`Generating report for Laudo ${laudo.id}. Details keys: ${Object.keys(details)}`);
      
      // Mapeamento de IDs para textos (para evitar UUIDs em labels extras)
      const questionIdToText = new Map<string, string>();
      sections.forEach(s => {
          s.questions?.forEach(q => {
              if (q.id && q.questionText) {
                  questionIdToText.set(q.id, q.questionText);
              }
          });
      });

      // Lista de seções para processar (com interface flexível)
      const finalSections: any[] = sections.map(s => ({ ...s, questions: s.questions || [] }));
      
      // Adicionar Extras
      if (laudo.dadosExtra) {
          try {
             const extras = typeof laudo.dadosExtra === 'string' ? JSON.parse(laudo.dadosExtra) : laudo.dadosExtra;
             Object.keys(extras).forEach(key => {
                 const normalizedKey = normalizeSectionName(key);
                 
                 // Verificar se já existe (usando normalização idêntica ao front)
                 // Também checa se a chave do dadosExtra corresponde a algum dataKey oficial
                 const isOfficial = finalSections.some(s => normalizeSectionName(s.name) === normalizedKey) || 
                                  Object.values(SECTION_FIELD_MAP).some(m => m.dataKey === key);

                 if (!isOfficial) {
                     // Criar fake section
                     const newSec: any = {
                        name: key,
                        isExtra: true,
                        questions: []
                     };
                     
                     if (typeof extras[key] === 'object') {
                         Object.keys(extras[key]).forEach(k => {
                            // Se a chave for um UUID, tenta buscar o texto original da questão
                            const questionText = questionIdToText.get(k) || k;
                            newSec.questions.push({ id: k, questionText: questionText } as any);
                         });
                     } else {
                         newSec.questions.push({ questionText: 'Descrição' } as any);
                     }
                     finalSections.push(newSec);
                 }
             });
          } catch(e) {}
      }

      const normalizeRespostaStatus = (value: unknown) =>
          String(value ?? '')
            .toLowerCase()
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');

      const getRespostaStatusClass = (value: unknown) => {
          const normalized = normalizeRespostaStatus(value);
          if (normalized === 'sem irregularidades') return 'item-valor item-valor-sem-irregularidades';
          if (normalized === 'com apontamento' || normalized === 'com irregularidades') return 'item-valor item-valor-com-apontamento';
          return 'item-valor';
      };

      const formatRespostaStatus = (value: unknown) => {
          const normalized = normalizeRespostaStatus(value);
          if (normalized === 'sem irregularidades') return 'sem irregularidades';
          if (normalized === 'com apontamento' || normalized === 'com irregularidades') return 'com apontamento';
          if (normalized === 'outros') return 'outros';
          return String(value).toLowerCase();
      };

      const renderItem = (sectionName: string, questionText: string, questionId: string, index: number) => {
          const normalizedKey = normalizeSectionName(sectionName);
          const mapping = SECTION_FIELD_MAP[normalizedKey];
          
          // Identificar a chave de dados (ex: analisesHidraulicas, dadosExtra, etc)
          const dataKey = mapping?.dataKey || normalizedKey;
          const fieldKey = mapping?.fields?.[index];

          // Buscar o objeto de dados da seção
          let sectionData = details[dataKey];
          
          // Fallback: tentar buscar em dadosExtra
          // Importante: para seções órfãs, o nome da seção DEVE ser usado para buscar em dadosExtra
          if (!sectionData && details.dadosExtra) {
               const extra = typeof details.dadosExtra === 'string' ? JSON.parse(details.dadosExtra) : details.dadosExtra;
               // Tenta pelo nome exato ou normalizado
               sectionData = extra[sectionName] || extra[normalizedKey];
          }
          
          // Parsing se for string JSON
          if (typeof sectionData === 'string' && sectionData.startsWith('{')) {
            try { sectionData = JSON.parse(sectionData); } catch {}
          }

          // Buscar o valor da resposta
          let value = '-';
          if (sectionData) {
            if (fieldKey && sectionData[fieldKey] !== undefined) {
               value = sectionData[fieldKey];
            } else if (typeof sectionData === 'string' && !fieldKey) {
               // CASO CRÍTICO: Se a seção é apenas uma string (ex: Atestado), retorna ela mesma
               value = sectionData;
            } else if (sectionData[questionText] !== undefined) {
               value = sectionData[questionText];
            } else if (sectionData[questionId] !== undefined) {
               value = sectionData[questionId];
            }
          }

          if (value === null || value === undefined || value === '') value = '-';
          if (typeof value === 'object') value = JSON.stringify(value);

          const displayValue = formatRespostaStatus(value);

          return `
            <div class="item-row">
                <span class="item-label">${questionText}</span>
                <span class="${getRespostaStatusClass(value)}">${displayValue}</span>
            </div>
          `;
      };

      // Divisão Colunas
      const mid = Math.ceil(finalSections.length / 2);
      const col1 = finalSections.slice(0, mid);
      const col2 = finalSections.slice(mid);

      const renderColumn = (secs: any[]) => {
          return secs.map(sec => `
            <div class="grupo avoid-break">
                <div class="categoria-box">${sec.name}</div>
                ${sec.questions?.map((q: any, idx: number) => renderItem(sec.name, q.questionText, q.id || '', idx)).join('')}
            </div>
          `).join('');
      };

      // Imagem removida conforme solicitado
      const logoBase64 = '';

      const frontendUrl = process.env[`${process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV'}_FRONTEND_URL`]
          || process.env.FRONTEND_URL
          || 'http://localhost:5173';
      const galeriaUrl = `${frontendUrl}/dashboard/laudos/${laudo.id}/galeria`;
      const qrCodeDataUrl = await QRCode.toDataURL(galeriaUrl, { width: 100, margin: 1 });

      return `
         <div class="page-container page-standard">
            <div style="height: 35px;"></div>
            <h2 class="relatorio-titulo">RELATÓRIO GERAL DE APONTAMENTO</h2>
            
            <div class="relatorio-grid">
                <div class="relatorio-coluna">
                    ${renderColumn(col1)}
                </div>
                <div class="relatorio-coluna">
                    ${renderColumn(col2)}
                </div>
            </div>

            <div class="download-fotos-section">
                <div class="download-fotos-titulo">DOWNLOAD DE FOTOS</div>
                <div class="download-fotos-content">
                    <p class="download-fotos-text">
                        Para maior conveniência e acessibilidade, as fotos poderão ser baixadas diretamente através do
                        QR Code fornecido neste documento. Ressaltamos que as imagens obtidas são adequadas para outras
                        análises e avaliações, independentemente do que estiver registrado em texto neste laudo. Esta
                        abordagem garante uma verificação visual completa e transparente das condições do imóvel.
                    </p>
                    <div class="download-fotos-qrcode">
                        <img src="${qrCodeDataUrl}" alt="QR Code Galeria" />
                    </div>
                </div>
            </div>

            <div class="encerramento-section">
                <div class="encerramento-titulo">ENCERRAMENTO</div>
                <hr class="encerramento-divisor" />
                <p class="encerramento-text">
                    Encerra o presente termo, o qual certifica e dá fé dos registros apresentados.
                </p>
                <div class="encerramento-rodape">
                </div>
            </div>
         </div>
      `;
  }
}
