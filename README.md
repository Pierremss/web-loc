# WebLoc 


https://github.com/user-attachments/assets/81649e2d-e36d-4887-81c1-82a9d911a638


<div align="center">

**Conecte-se com jogadores compatíveis através de interesses, estilos de jogo e horários em comum**

[![Angular](https://img.shields.io/badge/Angular-15+-DD0031?logo=angular)](https://angular.io/)
[![Ionic](https://img.shields.io/badge/Ionic-7+-3880FF?logo=ionic)](https://ionicframework.com/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933?logo=node.js)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8+-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4+-010101?logo=socket.io)](https://socket.io/)

<p align="center">
  <a href="#sobre"><img src="https://img.shields.io/badge/Sobre-6366f1?style=for-the-badge&logo=book&logoColor=white" /></a>
  <a href="#funcionalidades"><img src="https://img.shields.io/badge/Funcionalidades-8b5cf6?style=for-the-badge&logo=star&logoColor=white" /></a>
  <a href="#tecnologias"><img src="https://img.shields.io/badge/Tecnologias-ec4899?style=for-the-badge&logo=stackshare&logoColor=white" /></a>
  <a href="#instalação"><img src="https://img.shields.io/badge/Instalação-10b981?style=for-the-badge&logo=download&logoColor=white" /></a>
  <a href="#uso"><img src="https://img.shields.io/badge/Uso-f59e0b?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="#api"><img src="https://img.shields.io/badge/API-3b82f6?style=for-the-badge&logo=fastapi&logoColor=white" /></a>
</p>

</div>

---

##  Sobre

**WebLoc** é uma plataforma social desenvolvida para conectar jogadores com interesses e estilos de jogo compatíveis. Combinando recursos de rede social, matchmaking inteligente baseado em algoritmo de compatibilidade e comunicação em tempo real, o WebLoc oferece uma experiência completa para gamers encontrarem seus parceiros ideais de jogo.

###  Problema que resolve

- **Dificuldade em encontrar jogadores compatíveis** com horários e estilos de jogo similares
- **Falta de ferramentas específicas** para matchmaking baseado em preferências de jogos
- **Comunicação fragmentada** entre diferentes plataformas e jogos
- **Ausência de métricas de compatibilidade** entre jogadores

###  Diferenciais

- **Algoritmo de compatibilidade inteligente** (até 100% de match)
- **Sistema de swipe** estilo Tinder para descobrir jogadores
- **Chat em tempo real** com Socket.IO
- **Suporte multi-plataforma** (PC, Mobile, Consoles)
- **Catálogo extenso** com integração RAWG API
- **Interface moderna** com tema claro/escuro

---

##  Funcionalidades

### Para Jogadores

####  Sistema de Perfil Completo
- Cadastro com informações detalhadas (nome, nickname, avatar)
- Seleção de jogos favoritos do catálogo
- Definição de plataformas preferidas (PC, Mobile, Nintendo, Xbox, PlayStation)
- Configuração de horários disponíveis por dia da semana e período
- Escolha de estilo de jogo (Casual, Competitivo, Cooperativo)
- Gêneros de jogo preferidos
- Descrição personalizada do perfil

####  Descoberta de Jogadores (Swipe)
- Sistema de cards estilo Tinder para descobrir outros jogadores
- **Algoritmo de compatibilidade** que considera:
  - **Plataformas em comum** (peso: 25%)
  - **Jogos favoritos compartilhados** (peso: 50%)
  - **Estilo de jogo compatível** (peso: 15%)
  - **Horários disponíveis coincidentes** (peso: 10%)
- Filtros avançados: plataformas, gêneros, estilo, horários, compatibilidade mínima
- Animações de swipe (esquerda = passar, direita = interesse)
- Notificação visual de match

####  Sistema de Amizades
- Envio e aceitação de solicitações de amizade
- Lista de amigos com status online/offline
- Visualização de perfis detalhados
- Sistema de denúncias com categorias específicas

####  Salas de Conversa (Conversations)
- Criação de salas públicas ou privadas
- Sistema de convites para membros
- Avatar personalizado para cada sala
- Descrição e configurações da sala
- **Chat em tempo real** com Socket.IO
- Indicador de "digitando..."
- Histórico de mensagens persistente
- Deletar mensagens (apenas para si mesmo)

####  Recomendação de Jogos
- Formulário para sugerir novos jogos ao catálogo
- Campos: nome, plataformas, tipo, gênero, observações
- Sistema de aprovação/rejeição por administradores

####  Verificação de E-mail
- Código de 6 dígitos enviado por e-mail
- Expiração configurável (padrão: 10 minutos)
- Sistema de reenvio de código
- Validação obrigatória antes do primeiro acesso

####  Recuperação de Senha
- Código de redefinição enviado por e-mail
- Validação segura com bcrypt
- Interface amigável com feedback em tempo real

### Para Administradores

####  Painel Administrativo
- Dashboard centralizado
- Upload de avatar do administrador
- Acesso rápido a todas as funcionalidades

####  Gerenciamento de Usuários
- Listagem completa de jogadores
- Visualização de perfis detalhados
- Exclusão de contas (com registro em `deleted_accounts`)
- Proteção contra exclusão de outros admins

####  Gerenciamento de Jogos
- **CRUD completo** de jogos no catálogo
- Integração com **RAWG API** para importação em massa
- Gerenciamento de taxonomias:
  - Plataformas (platforms)
  - Gêneros (genres)
  - Tipos de jogo (game_types)
- Campos RAWG: `rawg_id`, `slug`, `description`, `released`, `background_image`, `rating`, `ratings_count`, `metacritic`

####  Moderação de Recomendações
- Lista de sugestões de jogos dos usuários
- Aprovação/rejeição com notas internas
- Filtros e ordenação (data, status, nome)
- Interface com skeleton loaders

####  Gerenciamento de Denúncias
- Visualização de denúncias de usuários
- Informações detalhadas (denunciante, denunciado, motivo, data)
- Formatação de data e hora em pt-BR
- Interface responsiva com cards

---

##  Tecnologias

### Frontend

| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| [Angular](https://angular.io/) | 15+ | Framework principal |
| [Ionic Framework](https://ionicframework.com/) | 7+ | UI Framework |
| TypeScript | 4.8+ | Linguagem |
| [Socket.IO Client](https://socket.io/) | 4.x | Comunicação em tempo real |
| Angular HttpClient | - | Cliente HTTP |
| Angular Reactive Forms | - | Validação de formulários |
| Angular Router | - | Roteamento com Guards |
| SCSS | - | Estilização |
| [Capacitor](https://capacitorjs.com/) | 5+ | Suporte mobile |

### Backend

| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| [Node.js](https://nodejs.org/) | 16+ | Runtime |
| [Express](https://expressjs.com/) | 4.x | Framework web |
| [MySQL](https://www.mysql.com/) | 8+ | Banco de dados |
| [mysql2](https://github.com/sidorares/node-mysql2) | - | ORM/Query Builder |
| [JWT](https://jwt.io/) | - | Autenticação |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | - | Hash de senhas |
| [Multer](https://github.com/expressjs/multer) | - | Upload de arquivos |
| [Socket.IO](https://socket.io/) | 4.x | Comunicação em tempo real |
| [Nodemailer](https://nodemailer.com/) | - | Envio de e-mails |
| [RAWG API](https://rawg.io/apidocs) | - | Catálogo de jogos |

### DevOps & Ferramentas

- **Controle de Versão**: Git
- **Gerenciador de Pacotes**: npm
- **Servidor de Desenvolvimento**: Angular Dev Server + Nodemon
- **Linting**: ESLint
- **Formatação**: EditorConfig

---

##  Instalação

### Pré-requisitos

- Node.js v16+ e npm
- MySQL 8+
- Conta Gmail (para envio de e-mails) ou configurar modo de teste
- Chave API da RAWG (opcional, para importação de jogos)

### 1. Clone o repositório

```bash
git clone https://github.com/Pierremss/web-loc.git
cd web-loc
```

### 2. Configure o banco de dados

```bash
# Acesse o MySQL
mysql -u root -p

# Importe o schema
SOURCE server/sql/schema.sql;
```

### 3. Configure o Backend

```bash
cd server

# Copie o arquivo de exemplo
cp .env.example .env

# Edite o .env com suas credenciais
nano .env
```

**Variáveis de ambiente necessárias:**

```env
# Banco de dados
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=webloc

# JWT
JWT_SECRET=seu_secret_super_seguro

# Admin (conta única)
ADMIN_EMAIL=admin@webloc.com
ADMIN_PASSWORD=senha_admin_segura

# E-mail (Gmail)
GMAIL_USER=seu_email@gmail.com
GMAIL_APP_PASSWORD=senha_app_gmail

# RAWG API (opcional)
RAWG_API_KEY=sua_chave_rawg
RAWG_API_BASE_URL=https://api.rawg.io/api

# Servidor
PORT=3333
```

** Importante:** Para usar o Gmail, você precisa gerar uma [senha de aplicativo](https://support.google.com/accounts/answer/185833).

### 4. Instale as dependências

```bash
# Backend
cd server
npm install

# Frontend (na raiz do projeto)
cd ..
npm install
```

### 5. Inicie os servidores

**Backend:**

```bash
cd server
npm run dev
```

A API estará rodando em `http://localhost:3333`

**Frontend:**

```bash
# Na raiz do projeto
"ionic serve" ou "ng serve"
```

O app estará rodando em `http://localhost:8100` ou `http://localhost:4200`

### 6. (Opcional) Importe jogos da RAWG

```bash
cd server
npm run import:rawg -- --pages=5 --details=true
```

**Parâmetros disponíveis:**

- `--pages`: Número de páginas a importar
- `--start-page`: Página inicial (padrão: 1)
- `--delay`: Intervalo entre requisições em ms (padrão: 1100)
- `--details=true`: Busca detalhes individuais de cada jogo
- `--dry-run=true`: Simula a importação sem gravar no banco

---

##  Uso

### Primeiro Acesso

#### Como Jogador

1. Acesse `http://localhost:8100`
2. Clique em **"Criar Conta"**
3. Preencha o formulário em 4 etapas:
   - **Etapa 1**: Dados básicos (nome, e-mail, senha)
   - **Etapa 2**: Perfil (avatar, jogos favoritos, plataformas)
   - **Etapa 3**: Preferências (estilos, gêneros, horários)
   - **Etapa 4**: Verificação de e-mail
4. Verifique seu e-mail e insira o código recebido
5. Pronto! Comece a explorar

#### Como Administrador

1. Acesse `http://localhost:8100/login`
2. Use as credenciais definidas no .env:
   - E-mail: `admin@webloc.com`
   - Senha: `senha_admin_segura`
3. Acesse o painel administrativo

### Funcionalidades Principais

#### Descobrir Perfis (Swipe)

```bash
/swipe
```

1. Ajuste os filtros de compatibilidade
2. Navegue pelos cards de jogadores
3. Arraste para a **direita** (💚) para dar like
4. Arraste para a **esquerda** (❌) para passar
5. Receba notificação quando houver **match**

#### Chat em Tempo Real

```bash
/conversations
```

1. Crie uma nova sala
2. Convide amigos
3. Converse em tempo real
4. Veja indicadores de "digitando..."
5. Acesse o histórico completo

#### Gerenciar Jogos (Admin)

```bash
/games
```

1. Adicione novos jogos manualmente
2. Importe jogos da RAWG API
3. Gerencie plataformas, gêneros e tipos
4. Edite ou exclua jogos existentes

---

##  API

### Autenticação

#### POST `/api/auth/register`

Cadastra um novo jogador.

**Body:**

```json
{
  "name": "João Silva",
  "nickname": "joao123",
  "email": "joao@example.com",
  "password": "senha123",
  "jogos_favoritos": [1, 2, 3],
  "platforms": [1, 2],
  "game_style": "Competitivo",
  "genres": [1, 2],
  "types": [1],
  "available_times": "{\"Segunda\":[\"Noite\"],\"Sexta\":[\"Tarde\",\"Noite\"]}",
  "profile": "Gamer competitivo, gosto de FPS e MOBAs"
}
```

**Response:**

```json
{
  "message": "Registro bem-sucedido. Verifique seu e-mail para ativar a conta.",
  "userId": 1
}
```

#### POST `/api/auth/login`

Realiza login.

**Body:**

```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "João Silva",
    "nickname": "joao123",
    "email": "joao@example.com",
    "tipo_usuario": "jogador",
    "avatar_url": "/uploads/avatars/1234.jpg"
  }
}
```

### Swipe / Matchmaking

#### GET `/api/swipe/deck`

Retorna deck de jogadores compatíveis.

**Query Params:**

- `limit`: Número de resultados (padrão: 20)
- `minCompatibility`: Compatibilidade mínima (0-100)
- `platformIds`: IDs de plataformas separados por vírgula
- `genreIds`: IDs de gêneros separados por vírgula
- `gameStyle`: Estilo de jogo
- `period`: Período disponível

**Response:**

```json
{
  "items": [
    {
      "userId": 2,
      "name": "Maria Santos",
      "nickname": "maria_gamer",
      "avatar_url": "/uploads/avatars/5678.jpg",
      "compatibility": {
        "score": 85,
        "commonGames": [
          { "id": 1, "name": "League of Legends" }
        ],
        "sharedPlatforms": [
          { "id": 1, "name": "PC" }
        ],
        "styleMatch": true,
        "scheduleOverlap": ["Segunda-Noite", "Sexta-Tarde"]
      },
      "summary": {
        "platforms": ["PC", "PlayStation"],
        "gameStyle": "Competitivo",
        "favoriteCount": 5,
        "availableTimes": "{\"Segunda\":[\"Noite\"],\"Sexta\":[\"Tarde\"]}"
      }
    }
  ]
}
```

#### POST `/api/swipe/action`

Registra ação de swipe.

**Body:**

```json
{
  "targetUserId": 2,
  "action": "like"
}
```

**Response:**

```json
{
  "ok": true,
  "match": true,
  "message": "It's a match!"
}
```

### Conversas

#### GET `/api/conversations`

Lista salas do usuário.

**Response:**

```json
{
  "rooms": [
    {
      "id": 1,
      "name": "Squad CS:GO",
      "description": "Time competitivo",
      "avatar_url": "/uploads/rooms/1234.jpg",
      "is_public": false,
      "created_at": "2025-01-15T10:30:00.000Z",
      "unreadCount": 5
    }
  ]
}
```

#### POST `/api/conversations`

Cria nova sala.

**Body (multipart/form-data):**

```
name: "Nova Squad"
description: "Grupo para rankeds"
is_public: false
members: [2, 3, 4]
avatar: [arquivo]
```

**Response:**

```json
{
  "id": 1,
  "name": "Nova Squad",
  "avatar_url": "/uploads/rooms/1234.jpg"
}
```

### Mensagens (Socket.IO)

#### Eventos do Cliente

**`join-room`**: Entrar em uma sala

```javascript
socket.emit('join-room', { roomId: 1 });
```

**`leave-room`**: Sair de uma sala

```javascript
socket.emit('leave-room', { roomId: 1 });
```

**`send-message`**: Enviar mensagem

```javascript
socket.emit('send-message', {
  roomId: 1,
  content: 'Olá, pessoal!'
});
```

**`typing`**: Indicar que está digitando

```javascript
socket.emit('typing', {
  roomId: 1,
  userId: 1,
  typing: true
});
```

#### Eventos do Servidor

**`new-message`**: Nova mensagem recebida

```javascript
socket.on('new-message', (message) => {
  console.log(message);
});
```

**`user-typing`**: Usuário digitando

```javascript
socket.on('user-typing', ({ userId, userName, typing }) => {
  console.log(`${userName} está digitando: ${typing}`);
});
```

**`message-read`**: Mensagem marcada como lida

```javascript
socket.on('message-read', ({ messageId, readerId }) => {
  console.log(`Mensagem ${messageId} lida por ${readerId}`);
});
```

---

## 🏗️ Arquitetura

```
webloc/
├── server/                          # Backend (Node.js + Express)
│   ├── index.js                     # Entry point + Socket.IO
│   ├── db.js                        # Configuração MySQL
│   ├── realtime.js                  # Lógica Socket.IO
│   ├── routes/                      # Rotas da API REST
│   │   ├── auth.js                  # Login, registro, verificação
│   │   ├── users.js                 # CRUD usuários
│   │   ├── games.js                 # CRUD jogos + importação RAWG
│   │   ├── friends.js               # Sistema de amizades
│   │   ├── messages.js              # Histórico de mensagens
│   │   ├── conversations.js         # Salas de chat
│   │   ├── swipe.js                 # Matchmaking/compatibilidade
│   │   └── game-recommendations.js  # Sugestões de jogos
│   ├── middleware/
│   │   └── auth.js                  # ensureAuth, ensureAdmin
│   ├── services/
│   │   ├── email-verification.js    # Códigos de verificação
│   │   ├── password-reset.js        # Redefinição de senha
│   │   └── rawg-importer.js         # Importador RAWG
│   └── sql/
│       ├── schema.sql               # Schema completo do banco
│       └── migrations/              # Migrações SQL
│
├── src/
│   ├── app/
│   │   ├── modules/
│   │   │   ├── auth/                # Login, registro, guards
│   │   │   ├── users/               # Lista de usuários (admin)
│   │   │   └── games/               # CRUD jogos + taxonomias
│   │   ├── pages/
│   │   │   ├── swipe/               # Descoberta de jogadores
│   │   │   ├── friends/             # Lista de amigos
│   │   │   ├── conversations/       # Salas de chat
│   │   │   ├── jogador-perfil/      # Perfil do jogador
│   │   │   ├── editar-perfil/       # Edição de perfil
│   │   │   ├── recomendar-jogo/     # Sugerir jogo
│   │   │   ├── menu-admin/          # Dashboard admin
│   │   │   └── recuperar-senha/     # Redefinir senha
│   │   ├── services/                # Serviços Angular (API calls)
│   │   ├── model/                   # Interfaces TypeScript
│   │   └── interceptors/            # HTTP interceptors
│   └── environments/                # Configurações de ambiente
│
├── angular.json                     # Configuração Angular CLI
├── capacitor.config.ts              # Configuração Capacitor (mobile)
├── ionic.config.json                # Configuração Ionic CLI
├── proxy.conf.json                  # Proxy /api → localhost:3333
└── package.json                     # Dependências do projeto
```

---

## 🔐 Segurança

- ✅ Senhas hasheadas com **bcrypt** (salt rounds: 10)
- ✅ Autenticação via **JWT** (expiração: 7 dias)
- ✅ Middleware `ensureAuth` e `ensureAdmin` para rotas protegidas
- ✅ Validação de entrada com **express-validator**
- ✅ Headers de segurança com **Helmet**
- ✅ **CORS** configurado para origens específicas
- ✅ Upload de arquivos com limite de **20MB** e validação de MIME
- ✅ Soft delete de contas com registro em `deleted_accounts`
- ✅ Rate limiting em endpoints críticos

---

##  Testes

```bash
# Testes unitários (Jasmine/Karma)
ng test

# Testes E2E
ng e2e
```

Estrutura básica de testes incluída em:
- usuario.spec.ts
- recuperar-senha.page.spec.ts
- autenticacao.service.spec.ts

---

##  Build Mobile

O projeto está configurado com **Capacitor** para build nativo.

```bash
# Build web
ionic build

# Adicionar plataforma Android
npx cap add android

# Adicionar plataforma iOS
npx cap add ios

# Sincronizar assets
npx cap sync

# Abrir no Android Studio
npx cap open android

# Abrir no Xcode
npx cap open ios
```

---

##  Personalização

### Temas

O WebLoc suporta **tema claro e escuro** alternável:

- Botão de alternância presente em Login, Registro e Home
- Preferência salva no `localStorage`
- Variáveis CSS personalizadas em global.scss

### Cores

Edite as variáveis em global.scss:

```scss
:root {
  --ion-color-primary: #6366f1;
  --ion-color-secondary: #8b5cf6;
  --ion-color-tertiary: #ec4899;
  // ...
}
```

---

##  Contribuindo

Contribuições são bem-vindas! Siga estes passos:

1. **Fork** o projeto
2. Crie uma **branch** para sua feature (`git checkout -b feature/MinhaFeature`)
3. **Commit** suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. **Push** para a branch (`git push origin feature/MinhaFeature`)
5. Abra um **Pull Request**

### Diretrizes

- Mantenha o código limpo e bem documentado
- Siga os padrões de código existentes
- Adicione testes para novas funcionalidades
- Atualize a documentação quando necessário

---

##  Reportar Bugs

Encontrou um bug? Por favor, abra uma [issue](https://github.com/Pierremss/webloc/issues) com:

- Descrição clara do problema
- Passos para reproduzir
- Comportamento esperado vs. atual
- Screenshots (se aplicável)
- Ambiente (SO, navegador, versão do Node)

---

##  Autores

- **Pierre Miguel Silveira Silva Franco** - *Desenvolvimento* - [@Pierremss](https://github.com/Pierremss)
- **Pedro Lucas Santos Dias** - *Desenvolvimento* - [@Peddr06](https://github.com/Peddr06)

---

##  Agradecimentos

- [RAWG API](https://rawg.io/) - Catálogo de jogos
- [Ionic Framework](https://ionicframework.com/) - UI Framework
- [Socket.IO](https://socket.io/) - Comunicação em tempo real
- Comunidade Angular/Ionic

---

##  Suporte

- **E-mail**: webloc00@gmail.com
- **Issues**: [GitHub Issues](https://github.com/Pierremss/webloc/issues)

---

<div align="center">

**Feito com ❤️ para a comunidade gamer**

<a href="#webloc---plataforma-de-matchmaking-para-gamers"><img src="https://img.shields.io/badge/⬆_Voltar_ao_Topo-6366f1?style=for-the-badge" /></a>

</div>
