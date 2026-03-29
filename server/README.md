# WebLoc API – RAWG Import

### 1. Atualize a tabela `games`
Execute o script SQL abaixo no banco MySQL utilizado pelo projeto:

```sql
SOURCE sql/alterations/add_rawg_columns.sql;
```

### 2. Configure as variáveis de ambiente
O arquivo `.env` já inclui:

```
RAWG_API_KEY=a3420474864f406a8576d158f286b5ff
RAWG_API_BASE_URL=https://api.rawg.io/api
```

Ajuste conforme necessário e mantenha a chave fora do versionamento em ambientes públicos.

### 3. Importe os jogos da RAWG
Depois de instalar as dependências (`npm install` no diretório `server/`), execute:

```bash
npm run import:rawg -- --pages=5 --details=true
```

Parâmetros úteis:
- `--pages`: limite de páginas a importar.
- `--start-page`: página inicial (1 por padrão).
- `--delay`: intervalo entre requisições (ms, padrão 1100).
- `--details=true`: busca detalhes individuais de cada jogo.
- `--dry-run=true`: mostra o que seria feito sem gravar no banco.

### 4. Endpoint administrativo (opcional)
Use `POST /api/games/import/rawg` com corpo JSON semelhante:

```json
{
  "pages": 5,
  "fetchDetails": true,
  "delayMs": 1200
}
```

Requer autenticação de administrador.
