const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Client } = require('pg');

// Configuração do S3
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Importar parser de EXIF
const exifParser = require('exif-parser');

// Converte stream para buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Extrai metadados EXIF (UserComment contém nossos metadados em JSON)
function extractMetadata(buffer) {
  let metadata = null;

  // 1. Tentar extrair via EXIF (Mais robusto para JPEGs)
  try {
    const parser = exifParser.create(buffer);
    const result = parser.parse();
    
    let userComment = result.tags.UserComment;
    
    if (userComment) {
        console.log('[EXIF] UserComment encontrado, tipo:', typeof userComment);
        
        // Limpar encoding
        if (Buffer.isBuffer(userComment)) {
          userComment = userComment.toString('utf8');
          userComment = userComment.replace(/^ASCII\0+/, '').replace(/^UNICODE\0+/, '').replace(/\0/g, '');
        } else if (typeof userComment === 'string') {
            userComment = userComment.replace(/^ASCII\0+/, '').replace(/^UNICODE\0+/, '').replace(/\0/g, '');
        }
        
        console.log('[EXIF] UserComment limpo (primeiros 200 chars):', userComment.substring(0, 200));

        // Tentar parsear o JSON
        const jsonStart = userComment.indexOf('{');
        const jsonEnd = userComment.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = userComment.substring(jsonStart, jsonEnd + 1);
            console.log('[EXIF] JSON extraído:', jsonStr);
            metadata = JSON.parse(jsonStr);
            console.log('[EXIF] Metadados parseados com sucesso');
        }
    } else {
      console.log('[EXIF] UserComment NÃO encontrado nos tags EXIF');
    }
  } catch (error) {
     console.log('[EXIF] Erro ao processar EXIF:', error.message);
  }

  if (metadata) return metadata;

  // 2. Fallback: Busca via Regex no buffer bruto
  console.log('[FALLBACK] Tentando extrair via Regex no buffer bruto...');
  try {
    const bufferStr = buffer.toString('latin1');
    
    // Regex melhorado: captura JSON completo com "ambiente", "ambiente_comentario", "data_captura" e "ordem"
    // Formato novo: {"ambiente":"...","ambiente_comentario":"...","tipo":"...",...}
    const jsonPatternNew = /\{"ambiente":"[^"]+","ambiente_comentario":"[^"]*","tipo":"[^"]+","categoria":"[^"]+","avaria_local":"[^"]*","descricao":"[^"]+","data_captura":"[^"]+"(?:,"latitude":[^,}]+)?(?:,"longitude":[^,}]+)?(?:,"ordem":\d+)?\}/;
    const matchNew = bufferStr.match(jsonPatternNew);
    
    if (matchNew) {
      console.log('[FALLBACK] JSON encontrado via Regex (formato novo):', matchNew[0]);
      return JSON.parse(matchNew[0]);
    }
    
    // Fallback para formato antigo (sem ambiente_comentario) - compatibilidade
    const jsonPatternOld = /\{"ambiente":"[^"]+","tipo":"[^"]+","categoria":"[^"]+","avaria_local":"[^"]*","descricao":"[^"]+","data_captura":"[^"]+"(?:,"latitude":[^,}]+)?(?:,"longitude":[^,}]+)?(?:,"ordem":\d+)?\}/;
    const matchOld = bufferStr.match(jsonPatternOld);
    
    if (matchOld) {
      console.log('[FALLBACK] JSON encontrado via Regex (formato antigo):', matchOld[0]);
      return JSON.parse(matchOld[0]);
    } else {
      console.log('[FALLBACK] Nenhum JSON encontrado via Regex');
    }
  } catch (error) {
    console.error('[FALLBACK] Erro na extração:', error.message);
  }

  console.log('[WARN] Nenhum metadado encontrado na imagem!');
  return null;
}

exports.handler = async (event) => {
  console.log('=== LAMBDA MARIAH METADATA EXTRACTOR ===');
  console.log('Evento recebido:', JSON.stringify(event, null, 2));
  
  // Conexão com PostgreSQL
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Extrair informações do evento S3
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`[S3] Bucket: ${bucket}`);
    console.log(`[S3] Key: ${key}`);
    
    // Extrair userId e laudoId do path: users/{userId}/laudos/{laudoId}/{filename}
    const pathParts = key.split('/');
    console.log('[S3] Path Parts:', JSON.stringify(pathParts));

    if (pathParts.length < 5 || pathParts[0] !== 'users' || pathParts[2] !== 'laudos') {
      console.log('[SKIP] Path não corresponde ao padrão esperado');
      return { statusCode: 200, body: 'Ignorado - path não corresponde' };
    }
    
    const usuarioId = pathParts[1];
    const laudoId = pathParts[3];
    
    console.log(`[IDs] Usuario: ${usuarioId}, Laudo: ${laudoId}`);
    
    // Baixar imagem do S3
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getCommand);
    const imageBuffer = await streamToBuffer(response.Body);
    
    console.log(`[S3] Imagem baixada: ${imageBuffer.length} bytes`);
    
    // Extrair metadados
    const metadata = extractMetadata(imageBuffer);
    console.log('[METADATA] Resultado:', JSON.stringify(metadata, null, 2));
    
    // Conectar ao banco
    await client.connect();
    console.log('[DB] Conectado ao PostgreSQL');


    // IMPORTANTE: Usar valores default quando metadata é null ou campos são undefined
    // REGRA DE NEGÓCIO: NENHUM campo pode ser NULL (exceto GPS)
    const ambienteValue = metadata?.ambiente || 'Desconhecido';
    const ambienteComentarioValue = metadata?.ambiente_comentario ?? '';  // String vazia, não null
    const tipoValue = metadata?.tipo || 'Desconhecido';
    const categoriaValue = metadata?.categoria || 'PADRAO';
    const avariaLocalValue = metadata?.avaria_local ?? '';  // String vazia, não null
    const descricaoValue = metadata?.descricao || 'Sem descrição';
    const dataCapturaValue = metadata?.data_captura ? new Date(metadata.data_captura) : new Date();
    const latitudeValue = metadata?.latitude ?? null;  // GPS pode ser null
    const longitudeValue = metadata?.longitude ?? null;  // GPS pode ser null
    const ordemValue = metadata?.ordem ?? 0;  // Ordem da foto dentro do ambiente

    // UPSERT ATÔMICO: Usa ON CONFLICT para evitar race condition
    // Se o s3_key já existir, atualiza os metadados. Senão, insere novo.
    console.log('[DB] Executando UPSERT atômico (INSERT ... ON CONFLICT DO UPDATE)');
    
    const upsertResult = await client.query(`
      INSERT INTO imagens_laudo (
        id, laudo_id, usuario_id, s3_key,
        ambiente, ambiente_comentario, tipo, categoria, avaria_local, descricao, data_captura,
        latitude, longitude, ordem,
        imagem_ja_foi_analisada_pela_ia, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3,
        $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13,
        'nao', NOW()
      )
      ON CONFLICT (s3_key) DO UPDATE SET
        ambiente = EXCLUDED.ambiente,
        ambiente_comentario = EXCLUDED.ambiente_comentario,
        tipo = EXCLUDED.tipo,
        categoria = EXCLUDED.categoria,
        avaria_local = EXCLUDED.avaria_local,
        descricao = EXCLUDED.descricao,
        data_captura = EXCLUDED.data_captura,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        ordem = EXCLUDED.ordem
    `, [
      laudoId,
      usuarioId,
      key,
      ambienteValue,
      ambienteComentarioValue,
      tipoValue,
      categoriaValue,
      avariaLocalValue,
      descricaoValue,
      dataCapturaValue,
      latitudeValue,
      longitudeValue,
      ordemValue
    ]);
    console.log('[DB] UPSERT executado. Rows:', upsertResult.rowCount);
    
    console.log('=== LAMBDA FINALIZADA COM SUCESSO ===');
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Processado com sucesso', 
        key, 
        metadata_found: !!metadata,
        ambiente: ambienteValue,
        tipo: tipoValue
      })
    };
    
  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error);
    throw error;
  } finally {
    try {
        await client.end();
        console.log('[DB] Conexão fechada');
    } catch (e) {
        console.error('[DB] Erro ao fechar conexão:', e);
    }
  }
};
