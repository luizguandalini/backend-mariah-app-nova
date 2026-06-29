import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * Gateway de download: notifica o usuário, em tempo real, quando um job de
 * geração de ZIP fica pronto ou falha. Cada usuário entra na própria sala
 * (`user_<id>`) para que os eventos cheguem apenas a quem solicitou.
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'download',
})
export class DownloadGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DownloadGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinUser')
  handleJoinUser(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    if (!data || !data.userId) {
      return;
    }
    const roomName = `user_${data.userId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { event: 'joined', room: roomName };
  }

  @SubscribeMessage('leaveUser')
  handleLeaveUser(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    if (!data || !data.userId) {
      return;
    }
    const roomName = `user_${data.userId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { event: 'left', room: roomName };
  }

  /**
   * Notifica que o ZIP de um job ficou pronto, com a URL de download.
   */
  notifyDownloadReady(
    userId: string,
    payload: { jobId: string; laudoId: string; tipo: string; ambiente?: string | null; url: string },
  ) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('download:ready', payload);
    }
  }

  /**
   * Notifica que a geração do ZIP de um job falhou.
   */
  notifyDownloadError(
    userId: string,
    payload: { jobId: string; laudoId: string; tipo: string; ambiente?: string | null; erro: string },
  ) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('download:error', payload);
    }
  }
}
