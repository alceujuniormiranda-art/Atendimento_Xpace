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
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// Outras configurações
const BOT_TIMEOUT_MINUTES = parseInt(process.env.BOT_TIMEOUT_MINUTES) || 30;
const LINK_ESCOLA = process.env.LINK_ESCOLA || 'https://links.nextfit.bio/5e3eXmh';
const IMAGE_PLANOS_URL = process.env.IMAGE_PLANOS_URL || '';

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

async function logMessage(phoneNumber, message, isFromBot) {
  await supabase
    .from('message_logs')
    .insert({
      phone_number: phoneNumber,
      message: message,
      is_from_bot: isFromBot,
      created_at: new Date().toISOString()
    });
}

async function getCustomResponse(keyword) {
  const { data, error } = await supabase
    .from('custom_responses')
    .select('response, image_url')
    .eq('keyword', keyword.toLowerCase())
    .eq('active', true)
    .single();

  if (error || !data) return null;
  return data;
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
      }
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
      }
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

Digite o número da opção ou escreva sua dúvida! 😊`;

async function processMessage(phoneNumber, message) {
  const msgLower = message.toLowerCase().trim();

  // Comando /stop - pausar bot
  if (msgLower === '/stop' || msgLower === 'stop') {
    await pauseBot(phoneNumber);
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

  // Opção 2 ou perguntas sobre modalidades
  if (msgLower === '2' || msgLower.match(/(modalidade|estilo|tipo de dança|aula|curso|ballet|jazz|hip hop|funk|dança)/)) {
    return {
      type: 'text',
      content: `💃 *Nossas Modalidades:*

Oferecemos diversas modalidades para todas as idades!

Para ver todas as modalidades e horários, acesse nosso link:
🔗 ${LINK_ESCOLA}

Ou digite *3* para ver os horários das aulas!

Quer experimentar? Digite *4* para agendar sua aula experimental! 🎉`
    };
  }

  // Opção 3 ou perguntas sobre horários
  if (msgLower === '3' || msgLower.match(/(horário|horario|hora|grade|agenda|quando|que horas)/)) {
    return {
      type: 'text',
      content: `📅 *Horários das Aulas*

Para ver nossa grade completa de horários, acesse:
🔗 ${LINK_ESCOLA}

Lá você encontra todas as modalidades e horários disponíveis!

Quer agendar uma aula experimental? Digite *4*! 🎉`
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

  // Resposta padrão
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

      // Ignorar mensagens enviadas por mim
      if (isFromMe) {
        return res.status(200).json({ status: 'ignored' });
      }

      console.log(`📩 Mensagem de ${phoneNumber}: ${message}`);

      // Registrar mensagem recebida
      await logMessage(phoneNumber, message, false);

      // Verificar se o bot está pausado
      const paused = await isBotPaused(phoneNumber);
      if (paused) {
        console.log(`⏸️ Bot pausado para ${phoneNumber}`);
        
        if (message.toLowerCase().trim() === '/start' || message.toLowerCase().trim() === 'start') {
          await resumeBot(phoneNumber);
          await sendTextMessage(phoneNumber, '▶️ Bot reativado! Como posso te ajudar?\n\n' + WELCOME_MESSAGE);
        }
        
        return res.status(200).json({ status: 'paused' });
      }

      // Processar mensagem e obter resposta
      const response = await processMessage(phoneNumber, message);

      // Enviar resposta
      if (response.type === 'image' && response.imageUrl) {
        await sendImage(phoneNumber, response.imageUrl, response.caption);
      } else {
        await sendTextMessage(phoneNumber, response.content);
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
