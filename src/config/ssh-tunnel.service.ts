import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTunnel } from 'tunnel-ssh';
import * as fs from 'fs';

@Injectable()
export class SshTunnelService {
  private readonly logger = new Logger(SshTunnelService.name);
  private tunnel: any = null;

  constructor(private configService: ConfigService) {}

  async connect(): Promise<void> {
    const sshEnabled = this.configService.get('SSH_ENABLED') === 'true';
    const nodeEnv = this.configService.get('NODE_ENV');

    // Só conecta ao túnel SSH se estiver habilitado E em modo development
    if (!sshEnabled || nodeEnv !== 'development') {
      this.logger.log('SSH Tunnel desabilitado ou não está em modo development');
      return;
    }

    try {
      this.logger.log('🔐 Iniciando conexão SSH com AWS...');

      const privateKeyPath = this.configService.get('SSH_PRIVATE_KEY_PATH');

      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Chave privada SSH não encontrada em: ${privateKeyPath}`);
      }

      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

      const tunnelOptions = {
        autoClose: false,
        reconnectOnError: true,
      };

      const sshOptions = {
        host: this.configService.get('SSH_HOST'),
        port: parseInt(this.configService.get('SSH_PORT')),
        username: this.configService.get('SSH_USERNAME'),
        privateKey: privateKey,
      };

      const serverOptions = {
        port: parseInt(this.configService.get('DB_TUNNEL_LOCAL_PORT')),
      };

      const forwardOptions = {
        dstAddr: this.configService.get('DB_RDS_HOST'),
        dstPort: parseInt(this.configService.get('DB_RDS_PORT')),
      };

      this.tunnel = await createTunnel(tunnelOptions, serverOptions, sshOptions, forwardOptions);

      this.logger.log('✅ Túnel SSH estabelecido com sucesso!');
      this.logger.log(
        `📡 Encaminhando localhost:${serverOptions.port} -> ${forwardOptions.dstAddr}:${forwardOptions.dstPort}`,
      );

      // Aguarda um pouco para garantir que o túnel está totalmente estabelecido
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      this.logger.error('❌ Erro ao estabelecer túnel SSH:', error.message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.tunnel) {
      try {
        this.logger.log('🔌 Fechando túnel SSH...');
        this.tunnel.close();
        this.tunnel = null;
        this.logger.log('✅ Túnel SSH fechado com sucesso');
      } catch (error) {
        this.logger.error('❌ Erro ao fechar túnel SSH:', error.message);
      }
    }
  }

  isConnected(): boolean {
    return this.tunnel !== null;
  }
}
