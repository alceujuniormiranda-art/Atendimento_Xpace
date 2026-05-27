require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicialização do Supabase usando as variáveis de ambiente existentes
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NEW_RESPONSE = "⚠️ *Atenção:* Aceitamos Wellhub e TotalPass **apenas** para as seguintes modalidades: Ritmos, Jazz Funk (Terça), Heels (Quinta), Street Funk, Contemporâneo, Jazz, Ballet Fit e Muay Thai. Para as demais modalidades, consulte nossos planos particulares! 😊";

async function updateResponses() {
  console.log("🚀 Iniciando atualização das respostas personalizadas...");

  // 1. Atualizar as linhas 4, 7, 8, 9 e 11 (usando os IDs ou keywords se necessário)
  // Como o usuário mencionou os números das linhas, vamos assumir que são os IDs na tabela
  const idsToUpdate = [4, 7, 8, 9, 11];
  
  for (const id of idsToUpdate) {
    const { error } = await supabase
      .from('custom_responses')
      .update({ response: NEW_RESPONSE, active: true })
      .eq('id', id);

    if (error) {
      console.error(`❌ Erro ao atualizar ID ${id}:`, error.message);
    } else {
      console.log(`✅ ID ${id} atualizado com sucesso.`);
    }
  }

  // 2. Remover (ou desativar) as linhas 5 e 6
  const idsToDelete = [5, 6];
  for (const id of idsToDelete) {
    const { error } = await supabase
      .from('custom_responses')
      .update({ active: false })
      .eq('id', id);

    if (error) {
      console.error(`❌ Erro ao desativar ID ${id}:`, error.message);
    } else {
      console.log(`✅ ID ${id} desativado com sucesso.`);
    }
  }

  console.log("\n✨ Processo concluído! Verifique seu painel do Supabase.");
}

updateResponses();
