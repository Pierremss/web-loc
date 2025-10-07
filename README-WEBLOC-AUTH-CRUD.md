# WebLoc — Autenticação + CRUD (Usuários e Jogos) com MySQL

Este pacote atualiza seu projeto Ionic/Angular para incluir:

- **Módulo de Autenticação** (login e cadastro).  
  - Jogadores se cadastram normalmente.  
  - **Administrador** faz login com **conta única predefinida** (em `.env` do servidor).  
- **CRUD completo**:
  - **Usuários** (somente admin pode listar/alterar/excluir outros).
  - **Jogos** (listar aberto; criar/editar/excluir somente admin).
- **Persistência em banco de dados MySQL**.
- Projeto organizado por módulos: **auth**, **users**, **games** (front), e **server** (back-end Express).

## Estrutura

```
server/            # API Node/Express
  index.js
  db.js
  routes/
    auth.js
    users.js
    games.js
  middleware/
    auth.js
  sql/schema.sql
  .env.example

src/app/modules/
  auth/            # login, register, guard, service
  users/           # listagem/remoção de usuários (admin)
  games/           # listagem/criação/remoção de jogos (admin)
```

## Banco de Dados

1. Suba o MySQL (p.ex. XAMPP).
2. Importe o schema:
   ```sql
   SOURCE server/sql/schema.sql;
   ```
3. O banco padrão é `webloc`. Ajuste conforme desejar no `.env`.

## Backend (Express)

1. Entre em `server/` e crie um arquivo `.env` copiando de `.env.example`:
   ```
   cp server/.env.example server/.env
   ```
   > Altere `DB_*`, `JWT_SECRET` e defina `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

2. Instale dependências e rode a API:
   ```
   cd server
   npm i
   npm run dev
   ```
   A API sobe em `http://localhost:3333/` (rota de saúde: `/api/health`).

## Frontend (Ionic/Angular)

1. Instale dependências na raiz do projeto (se necessário):
   ```
   npm i
   ```
2. Rode:
   ```
   ionic serve
   ```
   O `angular.json` já está configurado com `proxy.conf.json` para redirecionar `/api` à API local.

## Rotas principais (Front)

- `/login` — login de admin (com conta predefinida no `.env`) ou de jogador (cadastrado no banco).
- `/register` — cadastro de **jogador** (admins não são cadastrados via front).
- `/home` — atalho com botões para `/games` e `/users`.
- `/games` — lista jogos; admin pode criar/excluir.
- `/users` — **apenas admin**; lista e remove usuários.

## Segurança e Boas Práticas

- Senhas são salvas com **bcrypt**.
- Autenticação via **JWT**; middleware garante acesso admin onde necessário.
- Sem cadastro de **admin** (apenas login da conta única do `.env`).

## Observações

- As telas são **mínimas** e podem ser refinadas (validações, UX, feedbacks).
- Os serviços são isolados e prontos para ampliar para mais casos de uso.
- O campo `platforms` dos jogos usa `SET('PlayStation','Xbox','Nintendo','PC')` no MySQL.

---
Feito para cumprir: **login/cadastro**, **CRUD usuários e jogos**, **módulos separados**, e **persistência MySQL**.