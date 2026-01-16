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

      // 2. Buscar Imagens ordenadas
      const imagens = await this.imagemRepository.find({
        where: { laudoId },
        order: { ordem: 'ASC' },
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
        order: { ordem: 'ASC' },
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
      
      const htmlContent = this.buildHtml(laudo, imagensProcessadas, ambientes, sections, config);

      // Progresso 80% -> Gerar PDF
      this.updateStatus(laudoId, 'PROCESSING', 80);
      const pdfBuffer = await this.renderPdf(htmlContent);

      // Progresso 95% -> Upload
      this.updateStatus(laudoId, 'PROCESSING', 95);
      const s3Key = `laudos/pdf/${laudoId}_${Date.now()}.pdf`;
      const publicUrl = await this.uploadsService.uploadPdfBuffer(pdfBuffer, s3Key);

      // Se sucesso, deletar antigo se existir
      if (oldPdfUrl) {
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
             if (match && match[1]) {
                 const oldKey = match[1];
                 this.logger.log(`🗑️ Removendo PDF antigo: ${oldKey}`);
                 await this.uploadsService.deleteFile(oldKey);
             }
          } catch(err) {
              this.logger.warn('Falha ao tentar remover PDF antigo', err);
          }
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
       headless: true,
       args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

  private buildHtml(laudo: Laudo, imagens: any[], ambientes: any[], sections: LaudoSection[], config: any): string {
    const css = this.getCss(config);
    const cover = this.getCoverHtml(laudo);
    const infoPage = this.getInfoPageHtml(laudo, ambientes);
    const photos = this.getPhotosHtml(imagens, laudo);
    const report = this.getReportHtml(laudo, sections);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
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
        </body>
      </html>
    `;
  }

  private getCss(config: any): string {
     return `
        @import url("https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap");
        
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
            padding: ${config.margemPagina}px;
            overflow: hidden;
            border-top: 8px solid #6f2f9e;
            display: block;
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
        .grid-fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${config.espacamentoVertical}px ${config.espacamentoHorizontal}px; margin-top: 20px; }
        .foto-card { break-inside: avoid; margin-bottom: 5px; }
        .foto-container { border: 1px solid #999; margin-bottom: 4px; height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f0f0f0; }
        .foto-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
        .foto-ambiente { font-weight: bold; font-size: 10px; text-transform: uppercase; line-height: 1.2; text-align: left; }
        .foto-legenda { font-size: 9px; line-height: 1.4; text-align: left; min-height: 12px; }

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
            display: flex; align-items: center; justify-content: space-between; 
            background-color: #d9d9d9; 
            padding: 5px 10px; margin-bottom: 2px; font-size: 11px; 
        }
        .item-label { font-weight: 500; color: #000; }
        .item-valor { font-weight: 700; text-transform: uppercase; text-align: right; max-width: 50%; }
        
        .avoid-break { page-break-inside: avoid; }
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

      const tipoUso = (laudo.tipoUso || 'Industrial').toLowerCase();
      const tipo = (laudo.tipoImovel || laudo.tipo || '').toLowerCase();
      const unidade = laudo.numero || '';
      const tamanho = laudo.tamanho || '';
      const tipoVistoria = (laudo.tipoVistoria || '').toLowerCase();
      const endereco = laudo.endereco || '';
      const cep = laudo.cep || '';
      // No front, o campo "Realizada em:" está vazio (<p></p>), então vamos deixar vazio aqui também para ser identico.
      const dataRealizacao = ''; 
      
      const isSaida = tipoVistoria === 'saída' || tipoVistoria === 'saida';
      const textosMetodologia = isSaida ? METODOLOGIA_SAIDA_TEXTS : METODOLOGIA_TEXTS;

      return `
        <div class="page-container">
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
        <div class="page-container" style="border-top: none;">
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
            <div class="page-container" style="border-top: none;">
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

  private getReportHtml(laudo: Laudo, sections: LaudoSection[] = []): string {
      // 1. Normalização de Mapeamento (Igual ao Frontend)
      const SECTION_FIELD_MAP: Record<string, { dataKey: string; fields?: string[] }> = {
            "atestado da vistoria": { dataKey: "atestado" },
            "análises hidráulicas": { dataKey: "analisesHidraulicas", fields: ["fluxo_agua", "vazamentos"] },
            "análises elétricas": { dataKey: "analisesEletricas", fields: ["funcionamento", "disjuntores"] },
            "sistema de ar": { dataKey: "sistemaAr", fields: ["ar_condicionado", "aquecimento"] },
            "mecanismos de abertura": { dataKey: "mecanismosAbertura", fields: ["portas", "macanetas", "janelas"] },
            "revestimentos": { dataKey: "revestimentos", fields: ["tetos", "pisos", "bancadas"] },
            "mobilias": { dataKey: "mobilias", fields: ["fixa", "nao_fixa"] },
      };

      const normalizeSectionName = (name: string) => name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); // Manter espaços simples? O front usa replace(/\s+/g, "") mas o mapa tem espaços??
      // Front usa replace(/\s+/g, "") na função `normalizeSectionName` que define as chaves do map.
      // E as chaves do map no front são normalizadas (sem espaços).
      // Mas o map que defini acima eu copiei os nomes "bonitos".
      // Vamos ajustar. Melhor: usar chaves simples para compatibilidade.
      
      const details = laudo as any; // Cast para acessar indices dinâmicos
      
      // Lista de seções para processar (com interface flexível)
      const finalSections: any[] = sections.map(s => ({ ...s, questions: s.questions || [] }));
      
      // Adicionar Extras
      if (laudo.dadosExtra) {
          try {
             const extras = typeof laudo.dadosExtra === 'string' ? JSON.parse(laudo.dadosExtra) : laudo.dadosExtra;
             Object.keys(extras).forEach(key => {
                 // Verificar se já existe (normalizando)
                 const exists = finalSections.some(s => s.name.toLowerCase().includes(key.toLowerCase()));
                 if (!exists) {
                     // Criar fake section
                     const newSec: any = {
                        name: key,
                        isExtra: true,
                        questions: []
                     };
                     
                     if (typeof extras[key] === 'object') {
                         Object.keys(extras[key]).forEach(k => {
                            newSec.questions.push({ questionText: k } as any);
                         });
                     } else {
                         newSec.questions.push({ questionText: 'Descrição' } as any);
                     }
                     finalSections.push(newSec);
                 }
             });
          } catch(e) {}
      }

      // Render Item Helper
      const renderItem = (sectionName: string, questionText: string, fieldIndex: number) => {
          // Lógica de recuperação de valor igual ao Front
          const normName = sectionName.toLowerCase().replace(/\s+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          // Mapa com chaves normalizadas
          const MAP: any = {
              "atestadodavistoria": { dataKey: "atestado" },
              "analiseshidraulicas": { dataKey: "analisesHidraulicas", fields: ["fluxo_agua", "vazamentos"] },
              "analiseseletricas": { dataKey: "analisesEletricas", fields: ["funcionamento", "disjuntores"] },
              "sistemadear": { dataKey: "sistemaAr", fields: ["ar_condicionado", "aquecimento"] },
              "mecanismosdeabertura": { dataKey: "mecanismosAbertura", fields: ["portas", "macanetas", "janelas"] },
              "revestimentos": { dataKey: "revestimentos", fields: ["tetos", "pisos", "bancadas"] },
              "mobilias": { dataKey: "mobilias", fields: ["fixa", "nao_fixa"] },
          };

          const mapping = MAP[normName];
          let dataKey = mapping?.dataKey;
          // Se não achou dataKey, tenta encontrar nos dadosExtra pelo nome original
          
          let val = '-';
          
          // 1. Tentar dados estruturados na raiz
          if (dataKey && details[dataKey]) {
              const data = details[dataKey];
              if (mapping.fields && mapping.fields[fieldIndex]) {
                   val = data[mapping.fields[fieldIndex]];
              } else if (typeof data === 'string') {
                   val = data;
              } else if (data[questionText]) {
                   val = data[questionText];
              }
          } 
          // 2. Tentar dadosExtra
          else if (details.dadosExtra) {
              const extra = typeof details.dadosExtra === 'string' ? JSON.parse(details.dadosExtra) : details.dadosExtra;
              const sectionData = extra[sectionName] || extra[normName];
              if (sectionData) {
                  if (typeof sectionData === 'object') val = sectionData[questionText] || '-';
                  else val = sectionData;
              }
          }

          if (!val || val === '') val = '-';
          if (typeof val === 'object') val = JSON.stringify(val);

          return `
            <div class="item-row">
                <span class="item-label">${questionText}</span>
                <span class="item-valor">${val}</span>
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
                ${sec.questions?.map((q: any, idx: number) => renderItem(sec.name, q.questionText, idx)).join('')}
            </div>
          `).join('');
      };

      return `
         <div class="page-container">
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
         </div>
      `;
  }
}
