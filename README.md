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

### Usuários

| Método | Rota | Roles permitidos | Descrição |
|--------|------|------------------|-----------|
| `PATCH` | `/users/:id/role` | `DEV`, `ADMIN` | Altera o nível de acesso (role) de um usuário. Veja a matriz abaixo. |

#### Matriz de autorização para troca de role

| Ator \ (target → novo) | `USUARIO → ADMIN` | `ADMIN → USUARIO` | `* → DEV` | `DEV → *` |
|------------------------|:-----------------:|:-----------------:|:---------:|:---------:|
| `DEV`                  | ✅                | ✅                | ❌        | ❌        |
| `ADMIN`                | ✅                | ✅                | ❌        | ❌        |
| `USUARIO` / `FUNCIONARIO` | ❌             | ❌                | ❌        | ❌        |

Regras adicionais (validadas no service):

- Auto-edição é rejeitada com `400 Bad Request`.
- Transição para o mesmo role (no-op) é rejeitada com `400 Bad Request`.
- `DEV` é inalterável pela API.
- O campo `quantidadeImagens` (saldo de créditos de imagens) é preservado intacto em qualquer transição.

#### Deleção de usuários (soft delete)

`DELETE /users/:id` é a forma suportada de remover um usuário. A deleção é **soft**: a linha do `usuarios` permanece no banco com `deleted_at` populado e `ativo = false`. Laudos, imagens, contestações e demais registros de domínio **não** são apagados nem desatrelados — eles continuam apontando para o id original.

Regras (validadas em `users.service.softDelete` e `user-access-policy.ts`):

| Ator \ Alvo | `USUARIO` | `ADMIN` | `DEV` | si mesmo |
|-------------|:---------:|:-------:|:-----:|:--------:|
| `ADMIN`     | ✅        | ✅      | ❌    | ❌       |
| `DEV`       | ✅        | ✅      | ❌    | ❌       |
| `USUARIO`   | ❌        | ❌      | ❌    | ❌       |

Respostas:

- `204 No Content` em deleção bem-sucedida.
- `400 Bad Request` se o ator tentar deletar a si mesmo.
- `403 Forbidden` se o alvo for `DEV` ou se o ator não for `ADMIN`/`DEV`.
- `404 Not Found` se o id não existir (ou já estiver soft-deletado).

O endpoint `GET /users` e `GET /users/:id` filtram `deleted_at IS NULL` e adicionam, em cada linha, dois campos:

- `isSelf: boolean` — `true` apenas na linha do próprio usuário logado. O frontend **deve** esconder o toggle de role nessa linha, já que o backend rejeita auto-edição de role.
- `canDelete: boolean` — `true` quando o ator pode deletar aquela linha pela matriz acima. O frontend **deve** esconder o botão de deletar quando for `false`.

O mesmo email pode ser re-utilizado em um novo cadastro depois de um soft-delete, porque o índice único em `usuarios.email` é parcial (`WHERE deleted_at IS NULL`). O novo usuário é um id novo — registros antigos não são re-vinculados.

**Importante para contribuidores:** toda nova query que busca usuários por id (login, refresh-token, web-login-ticket, JWT validate, etc.) **deve** filtrar `deleted_at IS NULL`. As checagens atuais vivem em `auth.service.ts` (`login`, `refreshTokens`, `exchangeWebLoginTicket`) e em `auth/strategies/jwt.strategy.ts` — esta última é a que dá revogação imediata: o `JwtStrategy.validate` consulta o banco a cada request autenticado e rejeita com 401 quando o usuário foi soft-deletado, então o access token já emitido deixa de funcionar no request seguinte ao `DELETE /users/:id` (não precisa esperar o `JWT_EXPIRES_IN`).

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
