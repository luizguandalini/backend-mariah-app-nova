# Backend Nova Mariah - NestJS

Backend desenvolvido com NestJS e TypeScript usando Fastify como servidor HTTP.

## 🚀 Tecnologias

- **NestJS** - Framework progressivo para Node.js
- **TypeScript** - Superset JavaScript com tipagem estática
- **Fastify** - Servidor HTTP rápido e eficiente
- **PostgreSQL** - Banco de dados (AWS RDS)
- **RabbitMQ** - Message broker para filas
- **Docker** - Containerização para produção

## 📦 Instalação

```bash
npm install
```

## ⚙️ Configuração de Ambiente

### 1. Copiar arquivo de exemplo
```bash
cp .env.example .env
```

### 2. Variáveis Importantes

| Variável | DEV | PROD |
|----------|-----|------|
| `NODE_ENV` | `development` | `production` |
| `DB_HOST` | `localhost` (túnel SSH) | RDS diretamente |
| `DB_SYNCHRONIZE` | `true` | `false` |
| `DB_LOGGING` | `true` | `false` |
| `SSH_ENABLED` | `true` | `false` |
| `FRONTEND_URL` | `http://localhost:5173` | `https://mariah.com.br` |

## 🏃 Como rodar

### Desenvolvimento Local
```bash
# 1. Subir RabbitMQ via Docker
docker compose up -d

# 2. Rodar o backend (com hot-reload)
npm run start:dev
```

### Produção (EC2 com Docker)
```bash
# 1. Criar arquivo .env.prod com variáveis de produção
cp .env.example .env.prod
# Editar .env.prod com valores de produção

# 2. Build e deploy
docker compose -f docker-compose.prod.yml up -d --build
```

## 🔗 Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Mensagem de boas-vindas |
| GET | `/health` | Health check (usado por load balancers) |
| GET | `/api/docs` | Documentação Swagger |

## 🚀 Deploy para Produção (EC2)

### Pré-requisitos no EC2
1. Docker e Docker Compose instalados
2. Git configurado

### Deploy Manual
```bash
# No EC2
cd /home/ec2-user/backend-novamariah
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

### Deploy Automático (CI/CD)
O deploy é automático via GitHub Actions quando há push na branch `main`.

#### Configurar Secrets no GitHub:
1. Vá em **Settings > Secrets and variables > Actions**
2. Adicione:
   - `EC2_HOST`: IP do EC2 (ex: `98.81.229.161`)
   - `EC2_USER`: Usuário SSH (ex: `ec2-user`)
   - `EC2_SSH_KEY`: Conteúdo da chave .pem

### Rollback
Se algo der errado, o workflow automaticamente restaura a versão anterior.
Para rollback manual:
```bash
# No EC2
docker tag mariah-backend:backup mariah-backend:latest
docker compose -f docker-compose.prod.yml up -d
```

## 🐳 Comandos Docker Úteis

```bash
# Ver logs do backend
docker compose -f docker-compose.prod.yml logs -f backend

# Ver logs do RabbitMQ
docker compose -f docker-compose.prod.yml logs -f rabbitmq

# Restart do backend
docker compose -f docker-compose.prod.yml restart backend

# Rebuild sem cache
docker compose -f docker-compose.prod.yml build --no-cache

# Parar tudo
docker compose -f docker-compose.prod.yml down

# Limpar imagens antigas
docker image prune -f
```

## 🛠️ Scripts NPM

| Script | Descrição |
|--------|-----------|
| `npm run start` | Inicia o servidor |
| `npm run start:dev` | Inicia em modo desenvolvimento |
| `npm run start:debug` | Inicia em modo debug |
| `npm run start:prod` | Inicia em modo produção |
| `npm run build` | Compila o projeto |
| `npm run format` | Formata o código com Prettier |
| `npm run lint` | Verifica e corrige problemas de linting |

---

Servidor roda por padrão em: **http://localhost:3000**
Documentação Swagger: **http://localhost:3000/api/docs**
