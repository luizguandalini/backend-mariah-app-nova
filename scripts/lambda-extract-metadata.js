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
        // Limpar encoding
        if (Buffer.isBuffer(userComment)) {
          userComment = userComment.toString('utf8');
          userComment = userComment.replace(/^ASCII\0+/, '').replace(/^UNICODE\0+/, '').replace(/\0/g, '');
        } else if (typeof userComment === 'string') {
            userComment = userComment.replace(/^ASCII\0+/, '').replace(/^UNICODE\0+/, '').replace(/\0/g, '');
        }

        // Tentar parsear o JSON
        const jsonStart = userComment.indexOf('{');
        const jsonEnd = userComment.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = userComment.substring(jsonStart, jsonEnd + 1);
            metadata = JSON.parse(jsonStr);
        }
    }
  } catch (error) {
     // Ignorar erro de parsing EXIF (pode não ser JPEG) e tentar fallback
  }

  if (metadata) return metadata;

  // 2. Fallback: Busca via Regex no buffer bruto (Original / Compatibilidade com outros formatos)
  console.log('Metadados não encontrados via EXIF, tentando fallback via Regex...');
  try {
    const bufferStr = buffer.toString('latin1');
    const jsonPattern = /\{"ambiente"[^}]+\}/;
    const match = bufferStr.match(jsonPattern);
    
    if (match) {
      console.log('Metadados encontrados via fallback Regex.');
      return JSON.parse(match[0]);
    }
  } catch (error) {
    console.error('Erro no fallback de extração:', error);
  }

  return null;
}

exports.handler = async (event) => {
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
    
    console.log(`Processando: ${bucket}/${key}`);
    
    // Extrair userId e laudoId do path: users/{userId}/laudos/{laudoId}/{filename}
    const pathParts = key.split('/');
    if (pathParts.length < 5 || pathParts[0] !== 'users' || pathParts[2] !== 'laudos') {
      console.log('Path não corresponde ao padrão esperado, ignorando.');
      return { statusCode: 200, body: 'Ignorado - path não corresponde' };
    }
    
    const usuarioId = pathParts[1];
    const laudoId = pathParts[3];
    
    console.log(`Usuario: ${usuarioId}, Laudo: ${laudoId}`);
    
    // Baixar imagem do S3
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getCommand);
    const imageBuffer = await streamToBuffer(response.Body);
    
    console.log(`Imagem baixada: ${imageBuffer.length} bytes`);
    
    // Extrair metadados
    const metadata = extractMetadata(imageBuffer);
    console.log('Metadados extraídos:', metadata);
    
    // Conectar ao banco
    await client.connect();
    console.log('Conectado ao PostgreSQL');
    
    // Verificar se já existe registro para este s3_key
    const checkResult = await client.query(
      'SELECT id FROM imagens_laudo WHERE s3_key = $1',
      [key]
    );
    
    if (checkResult.rows.length > 0) {
      // Atualizar registro existente com metadados
      await client.query(`
        UPDATE imagens_laudo SET
          ambiente = $1,
          tipo = $2,
          categoria = $3,
          avaria_local = $4,
          descricao = $5,
          data_captura = $6
        WHERE s3_key = $7
      `, [
        metadata?.ambiente || null,
        metadata?.tipo || null,
        metadata?.categoria || null,
        metadata?.avaria_local || null,
        metadata?.descricao || null,
        metadata?.data_captura ? new Date(metadata.data_captura) : null,
        key
      ]);
      console.log('Registro atualizado com metadados');
    } else {
      // Inserir novo registro
      await client.query(`
        INSERT INTO imagens_laudo (
          id, laudo_id, usuario_id, s3_key,
          ambiente, tipo, categoria, avaria_local, descricao, data_captura,
          imagem_ja_foi_analisada_pela_ia, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6, $7, $8, $9,
          'nao', NOW()
        )
      `, [
        laudoId,
        usuarioId,
        key,
        metadata?.ambiente || null,
        metadata?.tipo || null,
        metadata?.categoria || null,
        metadata?.avaria_local || null,
        metadata?.descricao || null,
        metadata?.data_captura ? new Date(metadata.data_captura) : null
      ]);
      console.log('Novo registro inserido');
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Processado com sucesso', key })
    };
    
  } catch (error) {
    console.error('Erro:', error);
    throw error;
  } finally {
    await client.end();
  }
};
