import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Backend Nova Mariah - NestJS está funcionando! 🎉';
  }

  getStatus(): object {
    return {
      status: 'online',
      message: 'Backend está rodando perfeitamente!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  getRandomData(): object {
    const randomNumber = Math.floor(Math.random() * 1000);
    const fruits = ['🍎 Maçã', '🍌 Banana', '🍊 Laranja', '🍇 Uva', '🍓 Morango'];
    const randomFruit = fruits[Math.floor(Math.random() * fruits.length)];

    return {
      message: 'Dados aleatórios gerados com sucesso!',
      data: {
        numeroAleatorio: randomNumber,
        frutaAleatoria: randomFruit,
        timestamp: new Date().toISOString(),
        dica: 'Acesse GET /status para ver o status do servidor',
      },
    };
  }
}
