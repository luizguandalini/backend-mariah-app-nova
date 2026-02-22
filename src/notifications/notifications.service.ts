import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../users/entities/usuario.entity';

type ExpoPushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<boolean> {
    const usuario = await this.usuarioRepository.findOne({ where: { id: userId } });
    const token = usuario?.expoPushToken;
    if (!token) return false;

    return await this.sendExpoPush({
      to: token,
      title,
      body,
      data,
    });
  }

  private async sendExpoPush(payload: ExpoPushPayload): Promise<boolean> {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        this.logger.warn(`Expo push failed: ${JSON.stringify(result)}`);
        return false;
      }

      if (result?.data?.status === 'error') {
        this.logger.warn(`Expo push error: ${JSON.stringify(result?.data)}`);
        return false;
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Expo push exception: ${String(error)}`);
      return false;
    }
  }
}
