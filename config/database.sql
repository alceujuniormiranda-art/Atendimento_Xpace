-- ============================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS
-- Bot WhatsApp - Xpace Escola de Dança
-- ============================================

-- Tabela de conversas (controle de pausa do bot)
CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    bot_paused BOOLEAN DEFAULT FALSE,
    paused_at TIMESTAMP WITH TIME ZONE,
    last_ooo_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS last_ooo_at TIMESTAMP WITH TIME ZONE;

-- Índice para busca rápida por número
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);

-- Tabela de log de mensagens
CREATE TABLE IF NOT EXISTS message_logs (
    id BIGSERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    message TEXT,
    is_from_bot BOOLEAN DEFAULT FALSE,
    is_from_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE message_logs
ADD COLUMN IF NOT EXISTS is_from_admin BOOLEAN DEFAULT FALSE;

-- Índice para busca por número e data
CREATE INDEX IF NOT EXISTS idx_message_logs_phone ON message_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_message_logs_created ON message_logs(created_at);

-- Tabela de respostas personalizadas (para adicionar novas respostas sem mexer no código)
CREATE TABLE IF NOT EXISTS custom_responses (
    id BIGSERIAL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL,
    response TEXT NOT NULL,
    image_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca por keyword
CREATE INDEX IF NOT EXISTS idx_custom_responses_keyword ON custom_responses(keyword);

-- Tabela de mapeamento entre LID interno do WhatsApp e telefone real
CREATE TABLE IF NOT EXISTS lid_mapping (
    id BIGSERIAL PRIMARY KEY,
    lid_id VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lid_mapping_lid ON lid_mapping(lid_id);
CREATE INDEX IF NOT EXISTS idx_lid_mapping_phone ON lid_mapping(phone_number);

-- Configurações globais do bot
CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO global_settings (key, value)
VALUES ('bot_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- INSERIR ALGUMAS RESPOSTAS PERSONALIZADAS DE EXEMPLO
-- ============================================

-- Você pode adicionar mais respostas aqui ou pelo painel do Supabase
INSERT INTO custom_responses (keyword, response, image_url, active) VALUES
('matricula', 'A matrícula na Xpace custa R$80 e é válida para todas as modalidades! 📝\n\nQuer saber mais sobre nossos planos? Digite 1!', NULL, true),
('pagamento', 'Aceitamos as seguintes formas de pagamento:\n\n💳 Cartão de crédito (até 3x)\n💰 PIX\n📄 Boleto\n💵 Dinheiro\n\nPara mais informações, digite 6 para falar com um atendente!', NULL, true),
('idade', 'Temos turmas para todas as idades! 👶👧👩👵\n\nDesde crianças a partir de 3 anos até adultos!\n\nDigite 2 para ver nossas modalidades ou 4 para agendar uma aula experimental!', NULL, true),
('estacionamento', 'Temos estacionamento gratuito para alunos! 🚗\n\n📍 Rua Tijucas, 401\n\nDigite 5 para ver nossa localização!', NULL, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lid_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir acesso via service_role
DROP POLICY IF EXISTS "Enable all for service_role" ON conversations;
DROP POLICY IF EXISTS "Enable all for service_role" ON message_logs;
DROP POLICY IF EXISTS "Enable all for service_role" ON custom_responses;
DROP POLICY IF EXISTS "Enable all for service_role" ON lid_mapping;
DROP POLICY IF EXISTS "Enable all for service_role" ON global_settings;

CREATE POLICY "Enable all for service_role" ON conversations FOR ALL USING (true);
CREATE POLICY "Enable all for service_role" ON message_logs FOR ALL USING (true);
CREATE POLICY "Enable all for service_role" ON custom_responses FOR ALL USING (true);
CREATE POLICY "Enable all for service_role" ON lid_mapping FOR ALL USING (true);
CREATE POLICY "Enable all for service_role" ON global_settings FOR ALL USING (true);
