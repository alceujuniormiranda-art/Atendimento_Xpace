# 🕺 Bot WhatsApp - Xpace Escola de Dança

Bot de atendimento automático para WhatsApp da Xpace Escola de Dança, utilizando Evolution API, Railway e Supabase.

## ✨ Funcionalidades

- ✅ Respostas automáticas para perguntas frequentes
- ✅ Envio de imagens (planos, grade de horários)
- ✅ Menu interativo com opções numeradas
- ✅ Comando `/stop` para pausar o bot e chamar atendente
- ✅ Comando `/start` para reativar o bot
- ✅ Retomada automática após timeout (30 minutos)
- ✅ Log de todas as mensagens
- ✅ Respostas personalizáveis via banco de dados

## 🛠️ Tecnologias

- **Node.js** - Runtime JavaScript
- **Express** - Servidor web
- **Supabase** - Banco de dados PostgreSQL
- **Evolution API** - Conexão com WhatsApp
- **Railway** - Hospedagem

## 📋 Pré-requisitos

- Conta no [Supabase](https://supabase.com)
- Conta no [Railway](https://railway.app)
- Evolution API configurada

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/Atendimento_Xpace.git
cd Atendimento_Xpace
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

### 4. Configure o banco de dados

Execute o script SQL em `config/database.sql` no Supabase.

### 5. Inicie o servidor

```bash
npm start
```

## ⚙️ Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave pública do Supabase |
| `SUPABASE_SERVICE_KEY` | Chave de serviço do Supabase |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `EVOLUTION_INSTANCE` | Nome da instância (padrão: xpace) |
| `BOT_TIMEOUT_MINUTES` | Tempo para reativar bot (padrão: 30) |
| `IMAGE_PLANOS_URL` | URL da imagem dos planos |
| `IMAGE_GRADE_URL` | URL da imagem da grade de horários |
| `LINK_ESCOLA` | Link com informações da escola |

## 📱 Comandos do Bot

| Comando | Ação |
|---------|------|
| `/stop` ou `stop` | Pausa o bot e chama atendente |
| `/start` ou `start` | Reativa o bot |
| `1` | Ver planos e preços |
| `2` | Ver modalidades |
| `3` | Ver horários |
| `4` | Agendar aula experimental |
| `5` | Ver localização |
| `6` | Falar com atendente |

## 🔧 Rotas da API

| Rota | Método | Descrição |
|------|--------|-----------|
| `/` | GET | Health check |
| `/webhook` | POST | Recebe mensagens do WhatsApp |
| `/admin/pause/:phone` | POST | Pausa bot para um número |
| `/admin/resume/:phone` | POST | Retoma bot para um número |
| `/admin/paused` | GET | Lista conversas pausadas |

## 📝 Adicionar Novas Respostas

Você pode adicionar novas respostas personalizadas diretamente no Supabase, na tabela `custom_responses`:

1. Acesse o painel do Supabase
2. Vá em "Table Editor" > "custom_responses"
3. Clique em "Insert row"
4. Preencha:
   - `keyword`: palavra-chave que ativa a resposta
   - `response`: texto da resposta
   - `image_url`: URL da imagem (opcional)
   - `active`: true para ativar

## 📄 Licença

MIT License - Xpace Escola de Dança
