# Backend Nova Mariah - NestJS

Backend desenvolvido com NestJS e TypeScript usando Fastify como servidor HTTP.

## 🚀 Tecnologias

- **NestJS** - Framework progressivo para Node.js
- **TypeScript** - Superset JavaScript com tipagem estática
- **Fastify** - Servidor HTTP rápido e eficiente

## 📦 Instalação

```bash
npm install
```

## 🏃 Como rodar

### Modo desenvolvimento (com hot-reload)
```bash
npm run start:dev
```

### Modo produção
```bash
npm run build
npm run start:prod
```

## 🔗 Rotas disponíveis

- **GET /** - Mensagem de boas-vindas
- **GET /status** - Status do servidor com informações
- **GET /random** - Retorna dados aleatórios para teste

## 📝 Exemplos de uso

```bash
# Testar rota principal
curl http://localhost:3000

# Verificar status
curl http://localhost:3000/status

# Obter dados aleatórios
curl http://localhost:3000/random
```

## 🛠️ Scripts disponíveis

- `npm run start` - Inicia o servidor
- `npm run start:dev` - Inicia em modo desenvolvimento
- `npm run start:debug` - Inicia em modo debug
- `npm run build` - Compila o projeto
- `npm run format` - Formata o código com Prettier
- `npm run lint` - Verifica e corrige problemas de linting

---

Servidor roda por padrão em: **http://localhost:3000**
