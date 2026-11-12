#!/usr/bin/env node
/**
 * scripts/backup-db.mjs
 * CAF-000116 — Rotina de Backup Lógico Diário e Envio para Google Drive
 * 
 * - Gera dump lógico comprimido (.sql.gz)
 * - Mascara credenciais e connection strings nos logs (RNF01 / CA06)
 * - Realiza upload via REST API do Google Drive (usando Service Account)
 * - Remove backups no Google Drive com mais de 30 dias (retenção automática)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

export const RETENCAO_DIAS = 30;

/**
 * Mascara qualquer connection string PostgreSQL para logs seguros
 * @param {string} url
 * @returns {string}
 */
export function mascararConnectionString(url = '') {
  if (!url) return '';
  return url.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@.+)/i, '$1********$3');
}

/**
 * Gera o nome de arquivo padronizado para o dump diário
 * @param {Date} [dataRef=new Date()]
 * @returns {string}
 */
export function gerarNomeArquivoBackup(dataRef = new Date()) {
  const d = dataRef instanceof Date ? dataRef : new Date(dataRef);
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const hora = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `cafeteriadoteatro_backup_${ano}-${mes}-${dia}_${hora}${min}.sql.gz`;
}

/**
 * Filtra lista de arquivos identificando os que excedem a janela de retenção
 * @param {Array<{ name: string, createdTime?: string }>} arquivos
 * @param {number} [dias=30]
 * @param {Date} [dataRef=new Date()]
 * @returns {Array} Arquivos que devem ser removidos
 */
export function filtrarDumpsAntigos(arquivos = [], dias = RETENCAO_DIAS, dataRef = new Date()) {
  const limiteMs = dias * 24 * 60 * 60 * 1000;
  const agoraMs = (dataRef instanceof Date ? dataRef : new Date(dataRef)).getTime();

  return arquivos.filter(arq => {
    let tempoArq = null;
    if (arq.createdTime) {
      tempoArq = new Date(arq.createdTime).getTime();
    } else {
      // Tenta extrair a data do nome do arquivo: YYYY-MM-DD
      const m = arq.name.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        tempoArq = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
      }
    }

    if (!tempoArq || isNaN(tempoArq)) return false;
    return (agoraMs - tempoArq) > limiteMs;
  });
}

/**
 * Gera token JWT para autenticação com Service Account do Google
 * @param {Object} saKey Credenciais da Service Account
 * @returns {string} Assinatura JWT
 */
export function gerarJwtGoogleServiceAccount(saKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: saKey.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Claim = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signInput = `${b64Header}.${b64Claim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(saKey.private_key, 'base64url');

  return `${signInput}.${signature}`;
}

/**
 * Executa o backup lógico e upload
 */
export async function runBackup(options = {}) {
  console.log('=== Início do Backup Lógico Automatizado (CAF-000116) ===');
  
  const dbUrl = options.dbUrl || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL ou SUPABASE_DB_URL não configurada no ambiente.');
  }

  console.log(`✓ Alvo: ${mascararConnectionString(dbUrl)}`);

  const outputDir = options.outputDir || path.resolve('backups');
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = gerarNomeArquivoBackup(options.dataRef);
  const filePath = path.join(outputDir, fileName);

  console.log(`-> Gerando dump com pg_dump e gzip: ${fileName}...`);
  try {
    // Executa pg_dump com compressão gzip
    execSync(`pg_dump "${dbUrl}" --no-owner --no-acl --clean --if-exists | gzip > "${filePath}"`, {
      stdio: 'pipe'
    });
  } catch (err) {
    throw new Error(`Falha ao executar pg_dump: ${err.message}`);
  }

  const stat = fs.statSync(filePath);
  const tamanhoKb = (stat.size / 1024).toFixed(1);
  console.log(`✓ Dump concluído com sucesso: ${tamanhoKb} KB gerados.`);

  // Upload para Google Drive se credenciais estiverem configuradas
  const saKeyJson = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GDRIVE_FOLDER_ID;

  if (saKeyJson && folderId) {
    console.log('-> Iniciando envio para pasta segura no Google Drive...');
    try {
      const saKey = JSON.parse(saKeyJson);
      const jwt = gerarJwtGoogleServiceAccount(saKey);

      // Obter access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error(`Falha ao autenticar no Google OAuth: ${JSON.stringify(tokenData)}`);
      }

      const accessToken = tokenData.access_token;
      const fileBytes = fs.readFileSync(filePath);

      // Upload multipart para o Drive
      const metadata = {
        name: fileName,
        parents: [folderId]
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody = Buffer.concat([
        Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)),
        Buffer.from(delimiter + 'Content-Type: application/gzip\r\n\r\n'),
        fileBytes,
        Buffer.from(closeDelimiter)
      ]);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      const uploadData = await uploadRes.json();
      console.log(`✓ Arquivo enviado para o Google Drive com ID: ${uploadData.id}`);

      // Listar arquivos para aplicar política de retenção de 30 dias
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,createdTime)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const listData = await listRes.json();

      if (Array.isArray(listData.files)) {
        const antigos = filtrarDumpsAntigos(listData.files, RETENCAO_DIAS);
        console.log(`✓ Política de retenção (${RETENCAO_DIAS} dias): ${antigos.length} arquivo(s) antigo(s) a remover.`);
        for (const arq of antigos) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${arq.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          console.log(`   - Removido dump expirado: ${arq.name}`);
        }
      }
    } catch (err) {
      console.error(`⚠️ Falha no envio para o Google Drive: ${err.message}`);
    }
  } else {
    console.log('ℹ️ GDRIVE_SERVICE_ACCOUNT_KEY não configurado; dump preservado localmente em backups/.');
  }

  console.log('=== Backup Lógico Finalizado com Sucesso ===');
  return { fileName, filePath, sizeBytes: stat.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/backup-db.mjs')) {
  runBackup()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`❌ ERRO NO BACKUP: ${err.message}`);
      process.exit(1);
    });
}

