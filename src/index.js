require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Inicialização
const app = express();
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configurações Z-API
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// Headers padrão para Z-API (inclui Client-Token se configurado)
const ZAPI_HEADERS = {
  'Content-Type': 'application/json',
  ...(ZAPI_CLIENT_TOKEN && { 'Client-Token': ZAPI_CLIENT_TOKEN })
};

// Outras configurações
const BOT_TIMEOUT_MINUTES = parseInt(process.env.BOT_TIMEOUT_MINUTES) || 30;
const MESSAGE_GROUP_DELAY = 5000; // 5 segundos para agrupar mensagens

// Sistema de agrupamento de mensagens
const pendingMessages = new Map(); // phoneNumber -> { messages: [], timer: null }
const LINK_ESCOLA = process.env.LINK_ESCOLA || 'https://links.nextfit.bio/5e3eXmh';
const IMAGE_PLANOS_URL = process.env.IMAGE_PLANOS_URL || 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663188334106/JIyArqOviydhbQnG.jpeg';
const IMAGE_HORARIOS_SEG_QUA = process.env.IMAGE_HORARIOS_SEG_QUA || 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663188334106/DEJsiUKIQIcQnDHg.PNG';
const IMAGE_HORARIOS_TER_QUI = process.env.IMAGE_HORARIOS_TER_QUI || 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663188334106/PCCVHpRiHdafUFBI.PNG';
const IMAGE_HORARIOS_SEX_SAB = process.env.IMAGE_HORARIOS_SEX_SAB || 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663188334106/MNVAZvMbWjIkLVQt.PNG';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5547999110328';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ============================================
// INTEGRAÇÃO COM GEMINI (IA)
// ============================================

const CONTEXTO_ESCOLA = `
Você é o assistente virtual da Xpace Escola de Dança, localizada na Rua Tijucas, 401 - Centro, Joinville - SC.

INFORMAÇÕES DA ESCOLA:

PLANOS E PREÇOS:
- Plano Anual: R$165/mês
- Plano Semestral: R$195/mês
- Plano Mensal: R$215/mês
- Turmas 1x na semana: Anual R$100, Semestral R$115, Mensal R$130
- Modalidade adicional: R$75/mês
- Matrícula: R$80

MODALIDADES E HORÁRIOS:

SEGUNDA E QUARTA:
- Street Dance (5+): 08:00, 14:30, 19:00
- Street Dance (12+): 19:00
- Street Dance (16+): 20:00
- Ritmos (15+): 08:00
- Teatro (12+): 09:00
- Teatro (15+): 18:00
- Populares (12+): 14:00
- Contemporâneo (12+): 19:00
- Fit Dance (15+): 19:00
- Acrobacia (12+): 20:00
- Jazz (18+): 20:00, 21:00
- Muay Thai: 20:00

TERÇA E QUINTA:
- Street Dance (12+): 09:00, 14:30, 20:00
- Baby Class (3+): 15:30
- Jazz Funk (15+): 19:00 (só terça)
- Heels (15+): 19:00 (só quinta)
- Ritmos (15+): 19:00
- Muay Thai (12+): 19:00, 20:00
- Dança de Salão (18+): 20:00
- K-Pop (12+): 20:00
- Ballet (12+): 21:00

SEXTA:
- Street Dance (18+): 19:00
- Street Funk (15+): 19:00
- Jiu Jitsu (6+): 19:00

SÁBADO:
- Jazz Funk (15+): 09:00
- Street Dance (18+): 10:00
- Heels (15+): 11:00
- Dancehall (15+): 14:30

REGRAS DE RESPOSTA:
1. Seja simpático e use emojis
2. Respostas curtas e diretas (máximo 3 parágrafos)
3. Sempre mencione que pode digitar 6 para falar com atendente
4. Para agendar aula experimental, indique digitar 4
5. Link com mais informações: ${LINK_ESCOLA}
6. Se não souber responder, sugira falar com atendente (digitar 6)
`;

async function askGemini(userMessage) {
  if (!GEMINI_API_KEY) {
    console.log('⚠️ Gemini API Key não configurada');
    return null;
  }
  
  console.log('🤖 Consultando Gemini para:', userMessage);
  
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `${CONTEXTO_ESCOLA}\n\nPergunta do cliente: ${userMessage}\n\nResponda de forma útil e amigável:`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('✅ Gemini respondeu:', text ? 'OK' : 'Vazio');
    return text || null;
  } catch (error) {
    console.error('❌ Erro ao consultar Gemini:', error.response?.data || error.message);
    return null;
  }
}

// ============================================
// FUNÇÕES DE BANCO DE DADOS
// ============================================

async function isBotPaused(phoneNumber) {
  const { data, error } = await supabase
    .from('conversations')
    .select('bot_paused, paused_at')
    .eq('phone_number', phoneNumber)
    .single();

  if (error || !data) return false;

  if (data.bot_paused) {
    const pausedAt = new Date(data.paused_at);
    const now = new Date();
    const diffMinutes = (now - pausedAt) / (1000 * 60);

    if (diffMinutes >= BOT_TIMEOUT_MINUTES) {
      await resumeBot(phoneNumber);
      return false;
    }
    return true;
  }
  return false;
}

async function pauseBot(phoneNumber) {
  const { error } = await supabase
    .from('conversations')
    .upsert({
      phone_number: phoneNumber,
      bot_paused: true,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone_number' });

  return !error;
}

async function resumeBot(phoneNumber) {
  const { error } = await supabase
    .from('conversations')
    .upsert({
      phone_number: phoneNumber,
      bot_paused: false,
      paused_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone_number' });

  return !error;
}

async function logMessage(phoneNumber, message, isFromBot, isFromAdmin = false) {
  await supabase
    .from('message_logs')
    .insert({
      phone_number: phoneNumber,
      message: message,
      is_from_bot: isFromBot,
      is_from_admin: isFromAdmin,
      created_at: new Date().toISOString()
    });
}

// Verificar se o admin está atendendo (mandou mensagem nos últimos 5 horas)
async function isAdminAttending(phoneNumber) {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  
  // Buscar a última mensagem do ADMIN para esse número nos últimos 5 horas
  const { data, error } = await supabase
    .from('message_logs')
    .select('is_from_admin, created_at')
    .eq('phone_number', phoneNumber)
    .eq('is_from_admin', true)  // Buscar APENAS mensagens do admin
    .gte('created_at', fiveHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return false;
  
  // Se existe mensagem do admin nos últimos 5 horas, ele está atendendo
  console.log(`🔍 Admin atendeu ${phoneNumber} às ${data[0].created_at}`);
  return true;
}

async function getCustomResponse(message) {
  // Busca na tabela custom_responses
  // Busca todas as palavras-chave ativas
  const { data, error } = await supabase
    .from('custom_responses')
    .select('keyword, response, image_url')
    .eq('active', true);

  if (error || !data || data.length === 0) return null;
  
  // Procurar se alguma palavra-chave está contida na mensagem
  const messageLower = message.toLowerCase();
  for (const item of data) {
    if (item.keyword && messageLower.includes(item.keyword.toLowerCase())) {
      return {
        response: item.response,
        image_url: item.image_url
      };
    }
  }
  return null;
}

async function getConversationSummary(phoneNumber) {
  // Buscar últimas mensagens da conversa
  const { data, error } = await supabase
    .from('message_logs')
    .select('message, is_from_bot, created_at')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return 'Sem histórico disponível';
  }

  // Identificar modalidade de interesse
  const allMessages = data.map(m => m.message.toLowerCase()).join(' ');
  let interesse = '';
  
  if (allMessages.includes('ballet') || allMessages.includes('balé')) interesse = 'Ballet';
  else if (allMessages.includes('jazz')) interesse = 'Jazz';
  else if (allMessages.includes('hip') || allMessages.includes('hop')) interesse = 'Hip Hop';
  else if (allMessages.includes('contempor')) interesse = 'Dança Contemporânea';
  else if (allMessages.includes('funk')) interesse = 'Funk';
  else if (allMessages.includes('sertanejo')) interesse = 'Sertanejo';
  else if (allMessages.includes('forró') || allMessages.includes('forro')) interesse = 'Forró';
  else if (allMessages.includes('salsa') || allMessages.includes('samba')) interesse = 'Danças Latinas';
  else if (allMessages.includes('plano') || allMessages.includes('preço') || allMessages.includes('valor')) interesse = 'Planos/Preços';
  else if (allMessages.includes('horário') || allMessages.includes('horario')) interesse = 'Horários';
  else if (allMessages.includes('experimental') || allMessages.includes('aula teste')) interesse = 'Aula Experimental';
  
  // Pegar últimas mensagens do cliente (não do bot)
  const clientMessages = data
    .filter(m => !m.is_from_bot)
    .slice(0, 3)
    .map(m => m.message)
    .reverse();

  let summary = '';
  if (interesse) {
    summary += `🎯 *Interesse:* ${interesse}\n`;
  }
  if (clientMessages.length > 0) {
    summary += `💬 *Últimas msgs:*\n${clientMessages.join('\n')}`;
  }
  
  return summary || 'Cliente pediu atendente';
}

async function notifyAdmin(clientPhone, contactName) {
  const summary = await getConversationSummary(clientPhone);
  const whatsappLink = `https://wa.me/${clientPhone.replace(/\D/g, '')}`;
  
  const message = `🚨 *NOVO ATENDIMENTO*

👤 *Contato:* ${contactName || clientPhone}
📱 *Telefone:* ${clientPhone}
🔗 *Link:* ${whatsappLink}

${summary}

_Clique no link para abrir a conversa_`;

  await sendTextMessage(ADMIN_PHONE, message);
  console.log(`📢 Admin notificado sobre ${clientPhone}`);
}

// ============================================
// FUNÇÕES DE ENVIO - Z-API
// ============================================

async function sendTextMessage(phoneNumber, text) {
  try {
    const phone = phoneNumber.replace(/\D/g, '');
    await axios.post(
      `${ZAPI_BASE_URL}/send-text`,
      {
        phone: phone,
        message: text
      },
      { headers: ZAPI_HEADERS }
    );
    await logMessage(phoneNumber, text, true);
    console.log(`✅ Mensagem enviada para ${phone}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error.response?.data || error.message);
    return false;
  }
}

async function sendImage(phoneNumber, imageUrl, caption = '') {
  try {
    const phone = phoneNumber.replace(/\D/g, '');
    await axios.post(
      `${ZAPI_BASE_URL}/send-image`,
      {
        phone: phone,
        image: imageUrl,
        caption: caption
      },
      { headers: ZAPI_HEADERS }
    );
    await logMessage(phoneNumber, `[IMAGEM] ${caption}`, true);
    console.log(`✅ Imagem enviada para ${phone}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar imagem:', error.response?.data || error.message);
    return false;
  }
}

// ============================================
// LÓGICA DO BOT - RESPOSTAS
// ============================================

const WELCOME_MESSAGE = `Olá! 👋 Bem-vindo(a) à *Xpace Escola de Dança*! 💃🕺

Sou o assistente virtual e estou aqui para te ajudar!

Como posso te ajudar hoje?

1️⃣ Ver nossos *planos e preços*
2️⃣ Conhecer as *modalidades* de dança
3️⃣ Ver *horários* das aulas
4️⃣ Agendar uma *aula experimental*
5️⃣ Saber nossa *localização*
6️⃣ Falar com um *atendente*

Digite o número da opção ou escreva sua dúvida! 😊

_A qualquer momento, digite *6* para falar com um atendente humano!_`;

async function processMessage(phoneNumber, message) {
  const msgLower = message.toLowerCase().trim();

  // Comando /stop - pausar bot
  if (msgLower === '/stop' || msgLower === 'stop') {
    await pauseBot(phoneNumber);
    
    // Notificar admin sobre novo atendimento
    notifyAdmin(phoneNumber, null).catch(err => {
      console.error('Erro ao notificar admin:', err.message);
    });
    
    return {
      type: 'text',
      content: '⏸️ Bot pausado! Um atendente humano irá te atender em breve.\n\nDigite /start para voltar ao atendimento automático.'
    };
  }

  // Comando /start - retomar bot
  if (msgLower === '/start' || msgLower === 'start') {
    await resumeBot(phoneNumber);
    return {
      type: 'text',
      content: '▶️ Bot reativado! Como posso te ajudar?\n\n' + WELCOME_MESSAGE
    };
  }

  // Verificar resposta personalizada no banco
  const customResponse = await getCustomResponse(msgLower);
  if (customResponse) {
    if (customResponse.image_url) {
      return {
        type: 'image',
        imageUrl: customResponse.image_url,
        caption: customResponse.response
      };
    }
    return { type: 'text', content: customResponse.response };
  }

  // Saudações
  if (msgLower.match(/^(oi|olá|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|opa|oie|oii)/)) {
    return { type: 'text', content: WELCOME_MESSAGE };
  }

  // Opção 1 ou perguntas sobre preço/planos
  if (msgLower === '1' || msgLower.match(/(preço|preco|valor|plano|quanto custa|mensalidade|pacote)/)) {
    if (IMAGE_PLANOS_URL) {
      return {
        type: 'image',
        imageUrl: IMAGE_PLANOS_URL,
        caption: `💰 *Confira nossos planos!*

✨ *Plano Anual:* R$165/mês
✨ *Plano Semestral:* R$195/mês  
✨ *Plano Mensal:* R$215/mês

📌 *Turmas 1x na semana:*
• Anual: R$100/mês
• Semestral: R$115/mês
• Mensal: R$130/mês

➕ Modalidade adicional: R$75/mês
📝 Matrícula: R$80

Quer agendar uma aula experimental gratuita? Digite *4*! 🎉`
      };
    }
    return {
      type: 'text',
      content: `💰 *Nossos Planos:*

✨ *Plano Anual:* R$165/mês
✨ *Plano Semestral:* R$195/mês  
✨ *Plano Mensal:* R$215/mês

📌 *Turmas 1x na semana:*
• Anual: R$100/mês
• Semestral: R$115/mês
• Mensal: R$130/mês

➕ Modalidade adicional: R$75/mês
📝 Matrícula: R$80

Quer agendar uma aula experimental gratuita? Digite *4*! 🎉`
    };
  }

  // Mapeamento de modalidades por dia (Jazz e Jazz Funk são diferentes!)
  const MODALIDADES_SEG_QUA = ['street dance', 'ritmos', 'teatro', 'populares', 'contemporâneo', 'contemporaneo', 'fit dance', 'fitdance', 'acrobacia', 'muay thai'];
  const MODALIDADES_TER_QUI = ['street dance', 'baby class', 'baby', 'heels', 'ritmos', 'muay thai', 'dança de salão', 'danca de salao', 'salão', 'salao', 'k-pop', 'kpop', 'k pop', 'ballet', 'balé'];
  const MODALIDADES_SEX_SAB = ['street dance', 'street funk', 'jiu jitsu', 'jiujitsu', 'jiu-jitsu', 'heels', 'dancehall'];
  
  // Jazz e Jazz Funk tratados separadamente
  const JAZZ_PURO = ['seg_qua']; // Jazz só aparece em Segunda e Quarta
  const JAZZ_FUNK = ['ter_qui', 'sex_sab']; // Jazz Funk aparece em Terça/Quinta e Sexta/Sábado

  // Função para encontrar imagens relevantes para uma modalidade
  function getImagensParaModalidade(texto) {
    const imagens = [];
    
    // Verificar Jazz Funk primeiro (antes de Jazz puro)
    const temJazzFunk = texto.includes('jazz funk') || texto.includes('jazzfunk');
    const temJazzPuro = !temJazzFunk && texto.includes('jazz');
    
    let temSegQua = MODALIDADES_SEG_QUA.some(mod => texto.includes(mod));
    let temTerQui = MODALIDADES_TER_QUI.some(mod => texto.includes(mod));
    let temSexSab = MODALIDADES_SEX_SAB.some(mod => texto.includes(mod));
    
    // Jazz puro só em Segunda e Quarta
    if (temJazzPuro) temSegQua = true;
    
    // Jazz Funk em Terça/Quinta e Sexta/Sábado
    if (temJazzFunk) {
      temTerQui = true;
      temSexSab = true;
    }
    
    if (temSegQua) imagens.push({ url: IMAGE_HORARIOS_SEG_QUA, caption: '📅 *Segunda e Quarta*' });
    if (temTerQui) imagens.push({ url: IMAGE_HORARIOS_TER_QUI, caption: '📅 *Terça e Quinta*' });
    if (temSexSab) imagens.push({ url: IMAGE_HORARIOS_SEX_SAB, caption: '📅 *Sexta e Sábado*' });
    
    return imagens;
  }

  // Verificar se perguntou sobre uma modalidade específica (jazz funk antes de jazz para match correto)
  const modalidadesRegex = /(street dance|street funk|ritmos|teatro|populares|contemporâneo|contemporaneo|fit dance|fitdance|acrobacia|jazz funk|jazzfunk|muay thai|baby class|baby|heels|dança de salão|danca de salao|salão|salao|k-pop|kpop|k pop|ballet|balé|jiu jitsu|jiujitsu|jiu-jitsu|dancehall|jazz)/;
  const matchModalidade = msgLower.match(modalidadesRegex);
  
  if (matchModalidade) {
    const modalidade = matchModalidade[0];
    const imagensRelevantes = getImagensParaModalidade(msgLower);
    
    if (imagensRelevantes.length > 0) {
      return {
        type: imagensRelevantes.length === 1 ? 'image' : 'multiple_images',
        imageUrl: imagensRelevantes.length === 1 ? imagensRelevantes[0].url : undefined,
        caption: imagensRelevantes.length === 1 ? imagensRelevantes[0].caption : undefined,
        images: imagensRelevantes.length > 1 ? imagensRelevantes : undefined,
        content: `💃 *${modalidade.charAt(0).toUpperCase() + modalidade.slice(1)}*

Confira acima os horários dessa modalidade!

🔗 Mais informações: ${LINK_ESCOLA}

Quer experimentar? Digite *4* para agendar sua aula experimental! 🎉`
      };
    }
  }

  // Opção 2 ou perguntas gerais sobre modalidades (envia todas as imagens)
  if (msgLower === '2' || msgLower.match(/(modalidade|estilo|tipo de dança|aula|curso|dança)/)) {
    return {
      type: 'multiple_images',
      images: [
        { url: IMAGE_HORARIOS_SEG_QUA, caption: '📅 *Segunda e Quarta*' },
        { url: IMAGE_HORARIOS_TER_QUI, caption: '📅 *Terça e Quinta*' },
        { url: IMAGE_HORARIOS_SEX_SAB, caption: '📅 *Sexta e Sábado*' }
      ],
      content: `💃 *Nossas Modalidades e Horários!*

Confira acima nossa grade completa!

🔗 Mais informações: ${LINK_ESCOLA}

Quer experimentar? Digite *4* para agendar sua aula experimental! 🎉`
    };
  }

  // Opção 3 ou perguntas sobre horários
  if (msgLower === '3' || msgLower.match(/(horário|horario|hora|grade|agenda|quando|que horas)/)) {
    return {
      type: 'multiple_images',
      images: [
        { url: IMAGE_HORARIOS_SEG_QUA, caption: '📅 *Segunda e Quarta*' },
        { url: IMAGE_HORARIOS_TER_QUI, caption: '📅 *Terça e Quinta*' },
        { url: IMAGE_HORARIOS_SEX_SAB, caption: '📅 *Sexta e Sábado*' }
      ],
      content: `📅 *Grade de Horários*

Confira acima nossa programação completa!

🔗 Mais informações: ${LINK_ESCOLA}

Quer experimentar? Digite *4* para agendar sua aula experimental! 🎉`
    };
  }

  // Opção 4 ou aula experimental
  if (msgLower === '4' || msgLower.match(/(experimental|experimentar|conhecer|visitar|teste|testar)/)) {
    return {
      type: 'text',
      content: `🎉 *Aula Experimental Gratuita!*

Que legal que você quer conhecer a Xpace! 

Para agendar sua aula experimental, acesse o link abaixo e escolha o melhor horário:

🔗 ${LINK_ESCOLA}

Ou se preferir, digite *6* para falar diretamente com um atendente e agendar! 😊

📍 Estamos na *Rua Tijucas, 401*`
    };
  }

  // Opção 5 ou localização
  if (msgLower === '5' || msgLower.match(/(endereço|endereco|localização|localizacao|onde fica|como chegar|mapa|local)/)) {
    return {
      type: 'text',
      content: `📍 *Nossa Localização:*

*Xpace Escola de Dança*
Rua Tijucas, 401

🔗 Acesse nosso link para mais informações:
${LINK_ESCOLA}

Te esperamos! 💃🕺`
    };
  }

  // Opção 6 ou falar com atendente
  if (msgLower === '6' || msgLower.match(/(atendente|humano|pessoa|falar com alguém|falar com alguem|atendimento)/)) {
    await pauseBot(phoneNumber);
    
    // Notificar admin sobre novo atendimento
    notifyAdmin(phoneNumber, null).catch(err => {
      console.error('Erro ao notificar admin:', err.message);
    });
    
    return {
      type: 'text',
      content: `👤 *Atendimento Humano*

Perfeito! Um de nossos atendentes irá te responder em breve.

⏰ Nosso horário de atendimento:
Segunda a Sexta: 9h às 21h
Sábado: 9h às 12h

Aguarde um momento, por favor! 😊`
    };
  }

  // Agradecimentos
  if (msgLower.match(/(obrigad|valeu|thanks|brigad)/)) {
    return {
      type: 'text',
      content: `Por nada! 😊 

Estamos sempre à disposição!

Se precisar de mais alguma coisa, é só chamar! 💃

*Xpace Escola de Dança* - Onde a dança transforma vidas! ✨`
    };
  }

  // Tentar responder com IA (Gemini)
  if (GEMINI_API_KEY) {
    const respostaIA = await askGemini(message);
    if (respostaIA) {
      return {
        type: 'text',
        content: respostaIA
      };
    }
  }

  // Resposta padrão (se IA não estiver configurada ou falhar)
  return {
    type: 'text',
    content: `Desculpe, não entendi sua mensagem. 😅

Por favor, escolha uma das opções:

1️⃣ *Planos e preços*
2️⃣ *Modalidades* de dança
3️⃣ *Horários* das aulas
4️⃣ Agendar *aula experimental*
5️⃣ *Localização*
6️⃣ Falar com *atendente*

Ou digite sua dúvida que tentarei ajudar! 😊`
  };
}

// ============================================
// FUNÇÃO PARA PROCESSAR MENSAGENS AGRUPADAS
// ============================================

async function processGroupedMessages(phoneNumber) {
  try {
    const pending = pendingMessages.get(phoneNumber);
    if (!pending || pending.messages.length === 0) return;

    // Juntar todas as mensagens em uma só
    const combinedMessage = pending.messages.join(' ');
    console.log(`📨 Processando ${pending.messages.length} mensagem(ns) agrupada(s) de ${phoneNumber}: "${combinedMessage}"`);

    // Limpar mensagens pendentes
    pendingMessages.delete(phoneNumber);

    // VERIFICAR SE ADMIN ESTÁ ATENDENDO ANTES DE PROCESSAR
    const adminAttending = await isAdminAttending(phoneNumber);
    if (adminAttending) {
      console.log(`🛑 Admin está atendendo ${phoneNumber} - bot não responde`);
      // Registrar a mensagem do cliente mas não responder
      await logMessage(phoneNumber, combinedMessage, false, false);
      return;
    }

    // Processar mensagem combinada e obter resposta
    const response = await processMessage(phoneNumber, combinedMessage);

    // Enviar resposta
    if (response.type === 'image' && response.imageUrl) {
      await sendImage(phoneNumber, response.imageUrl, response.caption);
    } else if (response.type === 'multiple_images' && response.images) {
      // Enviar múltiplas imagens em sequência
      for (const img of response.images) {
        await sendImage(phoneNumber, img.url, img.caption);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (response.content) {
        await sendTextMessage(phoneNumber, response.content);
      }
    } else {
      await sendTextMessage(phoneNumber, response.content);
    }
  } catch (error) {
    console.error(`❌ Erro ao processar mensagens agrupadas de ${phoneNumber}:`, error);
    pendingMessages.delete(phoneNumber);
  }
}

// ============================================
// WEBHOOK - RECEBER MENSAGENS DO Z-API
// ============================================

app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    
    console.log('📩 Webhook recebido:', JSON.stringify(data, null, 2));

    // Z-API envia diferentes tipos de eventos
    // Mensagem de texto recebida
    if (data.text && data.phone) {
      const phoneNumber = data.phone;
      const message = data.text.message || data.text;
      const isFromMe = data.fromMe || false;
      const isFromApi = data.fromApi || false;

      // Ignorar mensagens enviadas pela API (respostas do próprio bot)
      if (isFromApi) {
        console.log(`🤖 Mensagem do bot (fromApi), ignorando`);
        return res.status(200).json({ status: 'ignored_bot_message' });
      }

      // Se a mensagem foi enviada por mim (admin), registrar e não responder
      if (isFromMe) {
        // Registrar que o admin está atendendo esse contato
        await logMessage(phoneNumber, message, false, true);
        console.log(`👤 Admin enviou mensagem para ${phoneNumber} - bot pausado automaticamente`);
        return res.status(200).json({ status: 'admin_attending' });
      }

      console.log(`📩 Mensagem de ${phoneNumber}: ${message}`);

      // Registrar mensagem recebida
      await logMessage(phoneNumber, message, false);

      // Verificar se o bot está pausado
      const paused = await isBotPaused(phoneNumber);
      
      // Verificar se é comando para reativar (verificar ANTES de checar pausa)
      const msgTrimmed = message.toLowerCase().trim();
      
      // Comando /stop - processar ANTES do agrupamento
      if (msgTrimmed === '/stop' || msgTrimmed === 'stop') {
        console.log(`⏸️ Comando /stop recebido de ${phoneNumber}`);
        // Cancelar mensagens pendentes se houver
        if (pendingMessages.has(phoneNumber)) {
          clearTimeout(pendingMessages.get(phoneNumber).timer);
          pendingMessages.delete(phoneNumber);
        }
        await pauseBot(phoneNumber);
        // Notificar admin sobre novo atendimento
        notifyAdmin(phoneNumber, null).catch(err => {
          console.error('Erro ao notificar admin:', err.message);
        });
        await sendTextMessage(phoneNumber, '⏸️ Bot pausado! Um atendente humano irá te atender em breve.\n\nDigite /start para voltar ao atendimento automático.');
        return res.status(200).json({ status: 'paused' });
      }
      
      if (msgTrimmed === '/start' || msgTrimmed === 'start' || msgTrimmed === 'iniciar' || msgTrimmed === 'voltar') {
        console.log(`▶️ Comando de reativação recebido de ${phoneNumber}`);
        // Cancelar mensagens pendentes se houver
        if (pendingMessages.has(phoneNumber)) {
          clearTimeout(pendingMessages.get(phoneNumber).timer);
          pendingMessages.delete(phoneNumber);
        }
        await resumeBot(phoneNumber);
        await sendTextMessage(phoneNumber, '▶️ Bot reativado! Como posso te ajudar?\n\n' + WELCOME_MESSAGE);
        return res.status(200).json({ status: 'resumed' });
      }
      
      if (paused) {
        console.log(`⏸️ Bot pausado para ${phoneNumber}, ignorando mensagem`);
        return res.status(200).json({ status: 'paused' });
      }

      // Verificar se o admin está atendendo (mandou mensagem recentemente)
      const adminAttending = await isAdminAttending(phoneNumber);
      if (adminAttending) {
        console.log(`👤 Admin está atendendo ${phoneNumber}, bot não responde`);
        return res.status(200).json({ status: 'admin_attending' });
      }

      // Sistema de agrupamento de mensagens
      // Se já existe mensagens pendentes para esse número, adiciona e reinicia timer
      if (pendingMessages.has(phoneNumber)) {
        const pending = pendingMessages.get(phoneNumber);
        pending.messages.push(message);
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => processGroupedMessages(phoneNumber), MESSAGE_GROUP_DELAY);
        console.log(`⏳ Mensagem agrupada para ${phoneNumber} (total: ${pending.messages.length})`);
      } else {
        // Primeira mensagem - inicia o agrupamento
        pendingMessages.set(phoneNumber, {
          messages: [message],
          timer: setTimeout(() => processGroupedMessages(phoneNumber), MESSAGE_GROUP_DELAY)
        });
        console.log(`⏳ Aguardando mais mensagens de ${phoneNumber} (5s)...`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROTAS ADMINISTRATIVAS
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: 'Xpace Escola de Dança',
    api: 'Z-API',
    version: '2.0.0'
  });
});

app.post('/admin/pause/:phone', async (req, res) => {
  const phone = req.params.phone;
  await pauseBot(phone);
  res.json({ status: 'paused', phone });
});

app.post('/admin/resume/:phone', async (req, res) => {
  const phone = req.params.phone;
  await resumeBot(phone);
  res.json({ status: 'resumed', phone });
});

app.get('/admin/paused', async (req, res) => {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('bot_paused', true);
  res.json(data || []);
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot Xpace rodando na porta ${PORT}`);
  console.log(`📱 Webhook disponível em: /webhook`);
  console.log(`🔗 Z-API Instance: ${ZAPI_INSTANCE_ID}`);
  console.log(`⏱️ Timeout do bot: ${BOT_TIMEOUT_MINUTES} minutos`);
});
