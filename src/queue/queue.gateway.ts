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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'queue',
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(QueueGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinLaudo')
  handleJoinLaudo(
    @MessageBody() data: { laudoId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data || !data.laudoId) {
       return;
    }
    const roomName = `laudo_${data.laudoId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { event: 'joined', room: roomName };
  }

  @SubscribeMessage('leaveLaudo')
  handleLeaveLaudo(
    @MessageBody() data: { laudoId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data || !data.laudoId) {
        return;
     }
    const roomName = `laudo_${data.laudoId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { event: 'left', room: roomName };
  }

  notifyProgress(laudoId: string, data: any) {
    if (this.server) {
        this.server.to(`laudo_${laudoId}`).emit('progress', data);
    }
  }

  notifyStatusChange(laudoId: string, status: string) {
    if (this.server) {
      this.server.to(`laudo_${laudoId}`).emit('statusChange', { laudoId, status });
    }
  }
}
